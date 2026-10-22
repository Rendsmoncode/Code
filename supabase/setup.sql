-- =====================================================================
-- OPTCG Maison : configuration de la base Supabase
-- À copier-coller en entier dans Supabase > SQL Editor > New query > Run.
-- Le script peut être relancé sans risque : il ne supprime aucune donnée.
-- =====================================================================

-- ---------- Tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_-]{3,20}$'),
  role text not null default 'player' check (role in ('player', 'admin', 'owner')),
  boosters int not null default 0 check (boosters >= 0),          -- boosters offerts par un admin
  free_anchor timestamptz not null default now() - interval '60 minutes', -- horloge des boosters gratuits
  starter_claimed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id text primary key,
  data jsonb not null,
  rarity text not null default 'C',
  in_boosters boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Raretés : C Commune, UC Peu commune, R Rare, SR Super rare, UR Ultra rare, L Légendaire (LR), S 1 of 1.
alter table public.cards drop constraint if exists cards_rarity_check;
alter table public.cards add constraint cards_rarity_check check (rarity in ('C', 'UC', 'R', 'SR', 'UR', 'L', 'S'));

create table if not exists public.starter_decks (
  id text primary key,
  name text not null,
  leader text,
  cards jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.collection (
  user_id uuid not null references public.profiles on delete cascade,
  card_id text not null references public.cards on delete cascade,
  qty int not null check (qty > 0),
  primary key (user_id, card_id)
);

create table if not exists public.decks (
  id text primary key,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  name text not null,
  leader text,
  cards jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------- Fonctions utilitaires ----------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'));
$$;

-- Création automatique du profil à l'inscription. Le tout premier inscrit devient propriétaire.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, role)
  values (new.id, lower(new.raw_user_meta_data ->> 'username'),
          case when exists (select 1 from public.profiles) then 'player' else 'owner' end);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un deck ne peut contenir que des cartes possédées.
create or replace function public.check_deck() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v int;
  owned int;
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  new.updated_at := now();
  if coalesce(new.leader, '') <> '' and not exists (
    select 1 from public.collection where user_id = new.user_id and card_id = new.leader) then
    raise exception 'Vous ne possédez pas ce Leader.';
  end if;
  for k, v in select key, value::int from jsonb_each_text(new.cards) loop
    select coalesce((select qty from public.collection where user_id = new.user_id and card_id = k), 0) into owned;
    if v > owned then
      raise exception 'Vous ne possédez que % exemplaire(s) d''une des cartes du deck.', owned;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists decks_check on public.decks;
create trigger decks_check before insert or update on public.decks
  for each row execute function public.check_deck();

-- ---------- Boosters ----------
-- 1 booster gratuit toutes les 10 minutes, 6 en réserve au maximum.

create or replace function public.free_boosters(anchor timestamptz) returns int
language sql stable as $$
  select least(6, greatest(0, floor(extract(epoch from (now() - anchor)) / 600)))::int;
$$;

create or replace function public.booster_status() returns json
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  free int;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'Profil introuvable.'; end if;
  free := public.free_boosters(p.free_anchor);
  return json_build_object(
    'username', p.username, 'role', p.role, 'free', free, 'free_max', 6, 'gifted', p.boosters,
    'next_free_at', case when free >= 6 then null else p.free_anchor + (free + 1) * interval '10 minutes' end,
    'starter_claimed', p.starter_claimed, 'now', now());
end $$;

-- Tire une carte de la rareté voulue ; si aucune n'est disponible, prend la rareté la plus proche
-- (en dessous d'abord, puis au-dessus). Une carte 1 of 1 (S) déjà obtenue par un joueur ne sort plus,
-- et une 1 of 1 ne remplace jamais une rareté plus faible.
create or replace function public.pick_card(want text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  ranks text[] := array['C', 'UC', 'R', 'SR', 'UR', 'L', 'S'];
  idx int := array_position(ranks, want);
  cid text;
begin
  for i in reverse idx..1 loop
    select id into cid from public.cards c
      where in_boosters and rarity = ranks[i]
        and (rarity <> 'S' or not exists (select 1 from public.collection where card_id = c.id))
      order by random() limit 1;
    if cid is not null then return cid; end if;
  end loop;
  for i in idx + 1..6 loop
    select id into cid from public.cards where in_boosters and rarity = ranks[i] order by random() limit 1;
    if cid is not null then return cid; end if;
  end loop;
  return null;
end $$;

-- Ouvre un booster de 5 cartes : 3 Communes, 1 Peu commune, 1 Rare ou mieux.
-- Dernière carte : 1 SR sur 4, 1 UR sur 15, 1 LR sur 50, 1 « 1 of 1 » sur 500, sinon Rare.
create or replace function public.open_booster() returns json
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  roll float := random();
  slots text[];
  r text;
  cid text;
  is_new boolean;
  result json[] := '{}';
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profil introuvable.'; end if;
  if public.free_boosters(p.free_anchor) > 0 then
    update public.profiles
      set free_anchor = greatest(free_anchor, now() - interval '60 minutes') + interval '10 minutes'
      where id = p.id;
  elsif p.boosters > 0 then
    update public.profiles set boosters = boosters - 1 where id = p.id;
  else
    raise exception 'Aucun booster disponible pour le moment.';
  end if;
  slots := array['C', 'C', 'C', 'UC', case
    when roll < 1.0 / 500 then 'S'
    when roll < 1.0 / 500 + 1.0 / 50 then 'L'
    when roll < 1.0 / 500 + 1.0 / 50 + 1.0 / 15 then 'UR'
    when roll < 1.0 / 500 + 1.0 / 50 + 1.0 / 15 + 1.0 / 4 then 'SR'
    else 'R' end];
  foreach r in array slots loop
    -- Verrou : deux joueurs ne peuvent pas tirer la même 1 of 1 au même instant.
    if r = 'S' then perform pg_advisory_xact_lock(hashtext('optcg-one-of-one')); end if;
    cid := public.pick_card(r);
    if cid is null then raise exception 'Il n''y a encore aucune carte dans les boosters.'; end if;
    is_new := not exists (select 1 from public.collection where user_id = p.id and card_id = cid);
    insert into public.collection (user_id, card_id, qty) values (p.id, cid, 1)
      on conflict (user_id, card_id) do update set qty = public.collection.qty + 1;
    result := result || json_build_object('id', cid, 'new', is_new);
  end loop;
  return array_to_json(result);
end $$;

-- Qui possède chaque carte 1 of 1 (visible par tous).
create or replace function public.one_of_one_owners() returns table (card_id text, username text)
language sql stable security definer set search_path = public as $$
  select c.card_id, p.username
  from public.collection c
  join public.cards k on k.id = c.card_id
  join public.profiles p on p.id = c.user_id
  where k.rarity = 'S';
$$;

-- ---------- Deck préconstruit ----------

create or replace function public.claim_starter(starter_id text) returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  s public.starter_decks;
  k text;
  v int;
  deck_id text := gen_random_uuid()::text;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profil introuvable.'; end if;
  if p.starter_claimed then raise exception 'Vous avez déjà reçu votre deck préconstruit.'; end if;
  select * into s from public.starter_decks where id = starter_id;
  if not found then raise exception 'Deck préconstruit introuvable.'; end if;
  if exists (select 1 from public.cards where rarity = 'S'
             and (id = s.leader or id in (select jsonb_object_keys(s.cards)))) then
    raise exception 'Un deck préconstruit ne peut pas contenir de carte 1 of 1.';
  end if;
  if coalesce(s.leader, '') <> '' then
    insert into public.collection (user_id, card_id, qty) values (p.id, s.leader, 1)
      on conflict (user_id, card_id) do update set qty = public.collection.qty + 1;
  end if;
  for k, v in select key, value::int from jsonb_each_text(s.cards) loop
    insert into public.collection (user_id, card_id, qty) values (p.id, k, v)
      on conflict (user_id, card_id) do update set qty = public.collection.qty + excluded.qty;
  end loop;
  insert into public.decks (id, user_id, name, leader, cards) values (deck_id, p.id, s.name, s.leader, s.cards);
  update public.profiles set starter_claimed = true where id = p.id;
  return deck_id;
end $$;

-- ---------- Administration ----------

-- target null = tous les joueurs.
create or replace function public.admin_give_boosters(target text, amount int) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  if amount is null or amount < 1 or amount > 10000 then raise exception 'Nombre de boosters invalide.'; end if;
  update public.profiles set boosters = boosters + amount where target is null or username = lower(target);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Joueur introuvable.'; end if;
  return n;
end $$;

create or replace function public.admin_set_role(target text, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then
    raise exception 'Seul le propriétaire peut nommer des admins.';
  end if;
  if new_role not in ('player', 'admin') then raise exception 'Rôle invalide.'; end if;
  update public.profiles set role = new_role where username = lower(target) and role <> 'owner';
  if not found then raise exception 'Joueur introuvable (ou c''est le propriétaire).'; end if;
end $$;

-- ---------- Sécurité : RLS ----------

alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.starter_decks enable row level security;
alter table public.collection enable row level security;
alter table public.decks enable row level security;

drop policy if exists "profils visibles" on public.profiles;
create policy "profils visibles" on public.profiles for select to authenticated using (true);

drop policy if exists "cartes visibles" on public.cards;
create policy "cartes visibles" on public.cards for select to authenticated using (true);
drop policy if exists "cartes admin" on public.cards;
create policy "cartes admin" on public.cards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "starters visibles" on public.starter_decks;
create policy "starters visibles" on public.starter_decks for select to authenticated using (true);
drop policy if exists "starters admin" on public.starter_decks;
create policy "starters admin" on public.starter_decks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ma collection" on public.collection;
create policy "ma collection" on public.collection for select to authenticated using (user_id = auth.uid());

drop policy if exists "mes decks" on public.decks;
create policy "mes decks" on public.decks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Droits d'accès (l'exposition automatique des tables est désactivée) ----------

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select on public.profiles, public.collection to authenticated;
grant select, insert, update, delete on public.cards, public.starter_decks, public.decks to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.booster_status(), public.open_booster(), public.one_of_one_owners(),
  public.claim_starter(text), public.admin_give_boosters(text, int), public.admin_set_role(text, text)
  to authenticated;

-- ---------- Images des cartes (stockage public, écriture réservée aux admins) ----------

insert into storage.buckets (id, name, public) values ('cards', 'cards', true) on conflict (id) do nothing;

drop policy if exists "images cartes admin ajout" on storage.objects;
create policy "images cartes admin ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'cards' and public.is_admin());
drop policy if exists "images cartes admin suppression" on storage.objects;
create policy "images cartes admin suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'cards' and public.is_admin());
