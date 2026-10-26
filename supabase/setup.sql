-- =====================================================================
-- Nakama TCG : configuration de la base Supabase
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

-- Raretés : C Commune, UC Peu commune, R Rare, SR Super rare, UR Ultra rare, L Légendaire (LR), S 1on1.
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

-- Invitations personnelles : un lien unique par ami, avec pseudo réservé, deck de départ et boosters offerts.
create table if not exists public.invites (
  token uuid primary key default gen_random_uuid(),
  username text not null check (username ~ '^[a-z0-9_-]{3,20}$'),
  starter_id text references public.starter_decks on delete set null,
  boosters int not null default 10 check (boosters >= 0 and boosters <= 10000),
  created_at timestamptz not null default now(),
  used_by uuid references public.profiles on delete set null,
  used_at timestamptz
);

-- Statistiques de chaque joueur pour les succès. Les boosters sont comptés par le serveur,
-- les parties sont déclarées par le jeu à la fin de chaque match.
create table if not exists public.stats (
  user_id uuid primary key references public.profiles on delete cascade,
  boosters_opened int not null default 0,
  dry_streak int not null default 0,       -- boosters d'affilée sans SR ou mieux
  max_dry_streak int not null default 0,
  god_packs int not null default 0,
  best_batch int not null default 0,       -- plus grand nombre de boosters ouverts d'un coup
  two_legends boolean not null default false,
  games int not null default 0,
  wins int not null default 0,
  win_streak int not null default 0,
  best_win_streak int not null default 0,
  perfect_wins int not null default 0,     -- victoires sans perdre de Vie
  comeback_wins int not null default 0,    -- victoires avec 0 Vie restante
  beaten text[] not null default '{}'      -- pseudos des amis battus
);

create table if not exists public.achievements (
  user_id uuid not null references public.profiles on delete cascade,
  code text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

-- Game Master : sauvegardes des collections remises à zéro : on peut les rendre à tout moment.
create table if not exists public.collection_backups (
  id bigserial primary key,
  user_id uuid not null references public.profiles on delete cascade,
  username text not null,
  cards jsonb not null,                 -- {"id_carte": quantité, ...}
  created_at timestamptz not null default now(),
  restored_at timestamptz
);

-- Cartes reçues en cadeau (deck de départ, Game Master) pas encore « ouvertes » : le joueur les découvre
-- une par une comme un booster à sa prochaine visite.
create table if not exists public.pending_reveals (
  user_id uuid not null references public.profiles on delete cascade,
  card_id text not null references public.cards on delete cascade,
  qty int not null check (qty > 0),
  was_new boolean not null default false,   -- le joueur ne l'avait pas encore
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- Surprise : un joueur invité « en surprise » voit un écran noir jusqu'à ce que le propriétaire lance
-- la surprise (wait → go), puis il ouvre son booster géant et découvre le jeu (→ done).
alter table public.invites add column if not exists surprise boolean not null default false;
alter table public.profiles add column if not exists surprise text check (surprise in ('wait', 'go', 'done'));
-- Boosters de rareté offerts pendant la surprise : [{"r": "SR", "cards": ["id", …], "opened": false}, …]
alter table public.invites add column if not exists packs jsonb;
alter table public.profiles add column if not exists surprise_packs jsonb;

-- Parties en cours (pour le Game Master) : chaque joueur signale sa partie toutes les 30 secondes.
create table if not exists public.live_games (
  code text primary key,
  mode text not null default 'online',
  host text,
  guest text,
  phase text,
  updated_at timestamptz not null default now()
);

-- ---------- Fonctions utilitaires ----------

-- Met une carte offerte de côté pour l'ouverture façon booster (à appeler AVANT de l'ajouter à la collection).
create or replace function public.queue_reveal(uid uuid, cid text, n int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if n is null or n <= 0 then return; end if;
  insert into public.pending_reveals (user_id, card_id, qty, was_new)
    values (uid, cid, n, not exists (select 1 from public.collection where user_id = uid and card_id = cid))
    on conflict (user_id, card_id) do update set qty = public.pending_reveals.qty + excluded.qty,
      was_new = public.pending_reveals.was_new or excluded.was_new;
end $$;

-- Cartes offertes à ouvrir : renvoyées une seule fois, puis retirées de la file.
create or replace function public.take_reveals() returns json
language plpgsql security definer set search_path = public as $$
declare r json;
begin
  select coalesce(json_agg(json_build_object('id', card_id, 'n', qty, 'new', was_new) order by created_at), '[]') into r
    from public.pending_reveals where user_id = auth.uid();
  delete from public.pending_reveals where user_id = auth.uid();
  return r;
end $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'));
$$;

-- Création automatique du profil à l'inscription. Le tout premier inscrit devient propriétaire ;
-- ensuite, on ne peut s'inscrire qu'avec une invitation valide, au pseudo prévu.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(new.raw_user_meta_data ->> 'username');
  tok text := new.raw_user_meta_data ->> 'invite';
  first_user boolean := not exists (select 1 from public.profiles);
  inv public.invites;
begin
  if first_user then
    insert into public.profiles (id, username, role) values (new.id, uname, 'owner');
    return new;
  end if;
  if tok is null or tok !~ '^[0-9a-f-]{36}$' then raise exception 'Inscription sur invitation uniquement.'; end if;
  select * into inv from public.invites where token = tok::uuid and used_by is null for update;
  if not found then raise exception 'Invitation invalide ou déjà utilisée.'; end if;
  if inv.username <> uname then raise exception 'Cette invitation est réservée à un autre pseudo.'; end if;
  -- Boosters offerts ; la réserve de boosters gratuits démarre à zéro.
  insert into public.profiles (id, username, role, boosters, free_anchor, surprise, surprise_packs)
    values (new.id, uname, 'player', inv.boosters, now(), case when inv.surprise then 'wait' end, inv.packs);
  update public.invites set used_by = new.id, used_at = now() where token = inv.token;
  if inv.starter_id is not null and exists (select 1 from public.starter_decks where id = inv.starter_id) then
    perform public.grant_starter(new.id, inv.starter_id);
  end if;
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
  -- Le joueur concerné (les règles d'accès empêchent déjà d'écrire dans les decks d'un autre).
  new.user_id := coalesce(new.user_id, auth.uid());
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
    'starter_claimed', p.starter_claimed, 'surprise', p.surprise,
    'packs', (select coalesce(json_agg(json_build_object('r', x ->> 'r', 'n', jsonb_array_length(x -> 'cards'), 'opened', coalesce((x ->> 'opened')::boolean, false))), '[]')
              from jsonb_array_elements(coalesce(p.surprise_packs, '[]')) x),
    'now', now());
end $$;

-- Tire une carte de la rareté voulue ; si aucune n'est disponible, prend la rareté la plus proche
-- (en dessous d'abord, puis au-dessus). Une carte 1on1 (S) déjà obtenue par un joueur ne sort plus,
-- et une 1on1 ne remplace jamais une rareté plus faible.
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
-- Dernière carte : 1 SR sur 4, 1 UR sur 15, 1 LR sur 50, 1 « 1on1 » sur 2 000, sinon Rare.
-- God Pack : 1 booster sur 1 000 ne contient que des Légendaires, avec 10 % de chance que la dernière soit une 1on1.
-- gift_only : n'utiliser que les boosters offerts (ouvertures de plus de 10 boosters d'un coup).
create or replace function public.open_one_booster(gift_only boolean) returns json
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  roll float := random();
  god boolean := random() < 1.0 / 1000;
  slots text[];
  r text;
  cid text;
  is_new boolean;
  lucky boolean;
  result json[] := '{}';
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profil introuvable.'; end if;
  if not gift_only and public.free_boosters(p.free_anchor) > 0 then
    update public.profiles
      set free_anchor = greatest(free_anchor, now() - interval '60 minutes') + interval '10 minutes'
      where id = p.id;
  elsif p.boosters > 0 then
    update public.profiles set boosters = boosters - 1 where id = p.id;
  else
    raise exception 'Aucun booster disponible pour le moment.';
  end if;
  if god then
    slots := array['L', 'L', 'L', 'L', case when random() < 0.1 then 'S' else 'L' end];
  else
    slots := array['C', 'C', 'C', 'UC', case
      when roll < 1.0 / 2000 then 'S'
      when roll < 1.0 / 2000 + 1.0 / 50 then 'L'
      when roll < 1.0 / 2000 + 1.0 / 50 + 1.0 / 15 then 'UR'
      when roll < 1.0 / 2000 + 1.0 / 50 + 1.0 / 15 + 1.0 / 4 then 'SR'
      else 'R' end];
  end if;
  foreach r in array slots loop
    -- Verrou : deux joueurs ne peuvent pas tirer la même 1on1 au même instant.
    if r = 'S' then perform pg_advisory_xact_lock(hashtext('optcg-one-of-one')); end if;
    cid := public.pick_card(r);
    if cid is null then raise exception 'Il n''y a encore aucune carte dans les boosters.'; end if;
    is_new := not exists (select 1 from public.collection where user_id = p.id and card_id = cid);
    insert into public.collection (user_id, card_id, qty) values (p.id, cid, 1)
      on conflict (user_id, card_id) do update set qty = public.collection.qty + 1;
    result := result || json_build_object('id', cid, 'new', is_new, 'god', god);
  end loop;
  -- Statistiques pour les succès (boosters ouverts, série sans SR ou mieux, God Packs).
  lucky := god or slots[5] in ('SR', 'UR', 'L', 'S');
  insert into public.stats (user_id) values (p.id) on conflict do nothing;
  update public.stats set
    boosters_opened = boosters_opened + 1,
    god_packs = god_packs + god::int,
    dry_streak = case when lucky then 0 else dry_streak + 1 end,
    max_dry_streak = greatest(max_dry_streak, case when lucky then 0 else dry_streak + 1 end)
    where user_id = p.id;
  return array_to_json(result);
end $$;

create or replace function public.open_booster() returns json
language sql security definer set search_path = public as $$
  select public.open_one_booster(false);
$$;

-- Ouvre jusqu'à 10 boosters d'un coup, ou jusqu'à 100 s'ils sont tous offerts (les boosters gratuits
-- ne s'ouvrent jamais par plus de 10). S'il n'en reste plus en route, on rend ceux déjà ouverts.
create or replace function public.open_boosters(n int) returns json
language plpgsql security definer set search_path = public as $$
declare
  res jsonb := '[]';
  legends int;
begin
  if n < 1 or n > 100 then raise exception 'On peut ouvrir de 1 à 100 boosters à la fois.'; end if;
  if n > 10 and (select boosters from public.profiles where id = auth.uid()) < n then
    raise exception 'Au-delà de 10, on ne peut ouvrir d''un coup que des boosters offerts.';
  end if;
  for k in 1..n loop
    begin
      res := res || public.open_one_booster(n > 10)::jsonb;
    exception when others then
      if k = 1 then raise; end if;
      exit;
    end;
  end loop;
  select count(*) into legends from jsonb_array_elements(res) e join public.cards c on c.id = e->>'id' where c.rarity = 'L';
  update public.stats set best_batch = greatest(best_batch, jsonb_array_length(res) / 5), two_legends = two_legends or legends >= 2
    where user_id = auth.uid();
  return res;
end $$;

-- Une carte 1on1 est révélée à tous dès qu'un joueur l'a tirée.
create or replace function public.is_revealed(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.collection where card_id = cid);
$$;

-- Qui possède chaque carte 1on1 (visible par tous).
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
begin
  return public.grant_starter(auth.uid(), starter_id);
end $$;

-- Donne à un joueur un deck préconstruit : ses cartes vont dans la collection et le deck est créé.
create or replace function public.grant_starter(uid uuid, starter_id text) returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  s public.starter_decks;
  k text;
  v int;
  deck_id text := gen_random_uuid()::text;
begin
  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'Profil introuvable.'; end if;
  if p.starter_claimed then raise exception 'Vous avez déjà reçu votre deck préconstruit.'; end if;
  select * into s from public.starter_decks where id = starter_id;
  if not found then raise exception 'Deck préconstruit introuvable.'; end if;
  if exists (select 1 from public.cards where rarity = 'S'
             and (id = s.leader or id in (select jsonb_object_keys(s.cards)))) then
    raise exception 'Un deck préconstruit ne peut pas contenir de carte 1on1.';
  end if;
  if coalesce(s.leader, '') <> '' then
    perform public.queue_reveal(p.id, s.leader, 1);
    insert into public.collection (user_id, card_id, qty) values (p.id, s.leader, 1)
      on conflict (user_id, card_id) do update set qty = public.collection.qty + 1;
  end if;
  for k, v in select key, value::int from jsonb_each_text(s.cards) loop
    perform public.queue_reveal(p.id, k, v);
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

-- Crée une invitation et renvoie son jeton (pour construire le lien).
create or replace function public.admin_create_invite(uname text, starter text, nb int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u text := lower(trim(uname));
  t uuid;
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  if u !~ '^[a-z0-9_-]{3,20}$' then raise exception 'Pseudo invalide (3 à 20 caractères : lettres, chiffres, - ou _).'; end if;
  if exists (select 1 from public.profiles where username = u) then raise exception 'Ce pseudo est déjà pris par un joueur.'; end if;
  if exists (select 1 from public.invites where username = u and used_by is null) then
    raise exception 'Une invitation attend déjà ce pseudo.';
  end if;
  insert into public.invites (username, starter_id, boosters) values (u, nullif(starter, ''), coalesce(nb, 10)) returning token into t;
  return t;
end $$;

-- Ce que voit la personne invitée avant de créer son compte (accessible sans être connecté).
create or replace function public.invite_info(t text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  inv public.invites;
begin
  if t is null or t !~ '^[0-9a-f-]{36}$' then return null; end if;
  select * into inv from public.invites where token = t::uuid and used_by is null;
  if not found then return null; end if;
  return json_build_object('username', inv.username, 'boosters', inv.boosters, 'surprise', inv.surprise,
    'starter', (select name from public.starter_decks where id = inv.starter_id));
end $$;

-- ---------- Surprise ----------

-- Invitation « surprise » : comme une invitation normale, mais le joueur attend devant un écran noir.
create or replace function public.admin_create_surprise(uname text, starter text, nb int) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  t := public.admin_create_invite(uname, starter, nb);
  update public.invites set surprise = true where token = t;
  return t;
end $$;

-- Joueur déjà inscrit : il passe en attente (écran noir), reçoit le deck préconstruit (s'il ne l'a pas déjà
-- reçu) et des boosters.
create or replace function public.admin_prepare_surprise(target text, starter text, nb int) returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  select * into p from public.profiles where username = lower(trim(target)) for update;
  if not found then raise exception 'Joueur introuvable.'; end if;
  update public.profiles set surprise = 'wait', boosters = boosters + coalesce(nb, 0) where id = p.id;
  if coalesce(starter, '') <> '' and not p.starter_claimed then perform public.grant_starter(p.id, starter); end if;
end $$;

-- Lance la surprise (target null = tous les joueurs en attente). Renvoie le nombre de joueurs concernés.
create or replace function public.admin_surprise_go(target text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  update public.profiles set surprise = 'go' where surprise = 'wait' and (target is null or username = lower(target));
  get diagnostics n = row_count;
  return n;
end $$;

-- Joueurs concernés par une surprise, et invitations surprise pas encore utilisées.
drop function if exists public.admin_surprise_list();
create or replace function public.admin_surprise_list() returns table (username text, state text, packs int, starter text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  return query
    select p.username, p.surprise, coalesce(jsonb_array_length(p.surprise_packs), 0),
      (select d.leader from public.decks d where d.user_id = p.id order by d.updated_at limit 1)
      from public.profiles p where p.surprise is not null
    union all
    select i.username, 'invite', coalesce(jsonb_array_length(i.packs), 0), (select sd.leader from public.starter_decks sd where sd.id = i.starter_id)
      from public.invites i where i.surprise and i.used_by is null
    order by 1;
end $$;

-- Boosters de rareté choisis par l'admin pour un joueur (ou pour une invitation pas encore utilisée).
create or replace function public.admin_set_packs(target text, packs jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare u text := lower(trim(target));
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  if jsonb_typeof(packs) <> 'array' then raise exception 'Boosters invalides.'; end if;
  update public.profiles set surprise_packs = packs where username = u;
  if found then return; end if;
  update public.invites set packs = admin_set_packs.packs where username = u and used_by is null;
  if not found then raise exception 'Joueur ou invitation introuvable.'; end if;
end $$;

-- Le joueur ouvre un de ses boosters de rareté : les cartes rejoignent sa collection.
create or replace function public.open_surprise_pack(i int) returns json
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  pk jsonb;
  cid text;
  out jsonb := '[]';
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profil introuvable.'; end if;
  pk := p.surprise_packs -> i;
  if pk is null then raise exception 'Booster introuvable.'; end if;
  if coalesce((pk ->> 'opened')::boolean, false) then raise exception 'Booster déjà ouvert.'; end if;
  for cid in select jsonb_array_elements_text(pk -> 'cards') loop
    if not exists (select 1 from public.cards where id = cid) then continue; end if;
    out := out || jsonb_build_object('id', cid, 'new', not exists (select 1 from public.collection where user_id = p.id and card_id = cid));
    insert into public.collection (user_id, card_id, qty) values (p.id, cid, 1)
      on conflict (user_id, card_id) do update set qty = public.collection.qty + 1;
  end loop;
  update public.profiles set surprise_packs = jsonb_set(surprise_packs, array[i::text, 'opened'], 'true') where id = p.id;
  return out;
end $$;

-- Le joueur a fini la découverte.
create or replace function public.surprise_done() returns void
language sql security definer set search_path = public as $$
  update public.profiles set surprise = 'done' where id = auth.uid() and surprise = 'go';
$$;

-- Compte de test uniquement (pseudo commençant par « test ») : on efface tout et on rejoue la surprise.
create or replace function public.admin_reset_test(target text, starter text, nb int) returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  select * into p from public.profiles where username = lower(trim(target)) for update;
  if not found then raise exception 'Joueur introuvable.'; end if;
  if p.username !~ '^test' or p.role <> 'player' then raise exception 'Réservé aux comptes de test (pseudo commençant par « test »).'; end if;
  delete from public.pending_reveals where user_id = p.id;
  delete from public.decks where user_id = p.id;
  delete from public.collection where user_id = p.id;
  update public.profiles set surprise = 'wait', starter_claimed = false, boosters = coalesce(nb, 10), free_anchor = now(),
    surprise_packs = (select jsonb_agg(x - 'opened') from jsonb_array_elements(p.surprise_packs) x) where id = p.id;
  if coalesce(starter, '') <> '' then perform public.grant_starter(p.id, starter); end if;
end $$;

-- ---------- Parties en cours ----------
create or replace function public.game_ping(gcode text, grole text, gmode text, gphase text) returns void
language plpgsql security definer set search_path = public as $$
declare u text := (select username from public.profiles where id = auth.uid());
begin
  if u is null or coalesce(gcode, '') !~ '^[A-Z0-9]{4,8}$' then return; end if;
  insert into public.live_games (code, mode, host, guest, phase, updated_at)
    values (gcode, coalesce(gmode, 'online'), case when grole = 'host' then u end, case when grole = 'guest' then u end, gphase, now())
    on conflict (code) do update set mode = excluded.mode, phase = excluded.phase, updated_at = now(),
      host = coalesce(case when grole = 'host' then u end, public.live_games.host),
      guest = coalesce(case when grole = 'guest' then u end, public.live_games.guest);
  delete from public.live_games where updated_at < now() - interval '1 day';
end $$;

create or replace function public.admin_live_games() returns setof public.live_games
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  return query select * from public.live_games where updated_at > now() - interval '3 minutes' order by updated_at desc;
end $$;

-- ---------- Sécurité : RLS ----------

alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.starter_decks enable row level security;
alter table public.collection enable row level security;
alter table public.decks enable row level security;
alter table public.invites enable row level security;
alter table public.stats enable row level security;
alter table public.achievements enable row level security;
alter table public.collection_backups enable row level security;
alter table public.pending_reveals enable row level security;
alter table public.live_games enable row level security;

drop policy if exists "mes stats" on public.stats;
create policy "mes stats" on public.stats for select to authenticated using (user_id = auth.uid());
drop policy if exists "mes succes" on public.achievements;
create policy "mes succes" on public.achievements for select to authenticated using (user_id = auth.uid());

drop policy if exists "invitations admin" on public.invites;
create policy "invitations admin" on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profils visibles" on public.profiles;
create policy "profils visibles" on public.profiles for select to authenticated using (true);

-- Les cartes 1on1 restent secrètes tant que personne ne les a tirées (sauf pour les admins).
drop policy if exists "cartes visibles" on public.cards;
create policy "cartes visibles" on public.cards for select to authenticated using (
  rarity <> 'S' or public.is_admin() or public.is_revealed(id));
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

-- =====================================================================
-- Succès
-- =====================================================================

-- Fin de partie déclarée par le jeu (chaque joueur déclare son propre résultat).
create or replace function public.record_game(won boolean, opponent text, lives_left int, perfect boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me text;
  opp text;
begin
  select username into me from public.profiles where id = auth.uid();
  select username into opp from public.profiles where username = lower(opponent);
  if me is null or opp is null or opp = me then return; end if;
  insert into public.stats (user_id) values (auth.uid()) on conflict do nothing;
  update public.stats set
    games = games + 1,
    wins = wins + won::int,
    win_streak = case when won then win_streak + 1 else 0 end,
    best_win_streak = greatest(best_win_streak, case when won then win_streak + 1 else 0 end),
    perfect_wins = perfect_wins + (won and perfect)::int,
    comeback_wins = comeback_wins + (won and lives_left = 0)::int,
    beaten = case when won and not (opp = any(beaten)) then beaten || opp else beaten end
    where user_id = auth.uid();
end $$;

-- Vérifie tous les succès du joueur, enregistre les nouveaux et donne les boosters en récompense.
-- Renvoie la liste des succès débloqués à l'instant. (Les mêmes codes sont décrits dans js/achievements.js.)
create or replace function public.check_achievements() returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.stats;
  owned int; total int; own_c int; tot_c int; own_r int; tot_r int; legs int; ones int; urs int;
  theme boolean;
  rec record;
  gain int := 0;
  fresh json[] := '{}';
begin
  insert into public.stats (user_id) values (uid) on conflict do nothing;
  select * into s from public.stats where user_id = uid;
  select count(*) filter (where k.in_boosters and k.rarity <> 'S'),
         count(*) filter (where k.in_boosters and k.rarity = 'C'), count(*) filter (where k.in_boosters and k.rarity = 'R'),
         count(*) filter (where k.rarity = 'L'), count(*) filter (where k.rarity = 'S'), count(*) filter (where k.rarity = 'UR')
    into owned, own_c, own_r, legs, ones, urs
    from public.collection c join public.cards k on k.id = c.card_id where c.user_id = uid;
  select count(*) filter (where rarity <> 'S'), count(*) filter (where rarity = 'C'), count(*) filter (where rarity = 'R')
    into total, tot_c, tot_r from public.cards where in_boosters;
  -- Un thème (type) d'au moins 5 cartes entièrement possédé.
  select exists (
    select 1 from public.cards k, unnest(string_to_array(k.data->>'traits', '/')) t
    where k.in_boosters and k.rarity <> 'S'
    group by trim(t) having count(*) >= 5
      and bool_and(exists (select 1 from public.collection c where c.user_id = uid and c.card_id = k.id))) into theme;

  for rec in select * from (values
    ('win1', s.wins >= 1, 1), ('win10', s.wins >= 10, 3), ('win20', s.wins >= 20, 5),
    ('games10', s.games >= 10, 2), ('games50', s.games >= 50, 5),
    ('perfect', s.perfect_wins >= 1, 3), ('comeback', s.comeback_wins >= 1, 3),
    ('streak3', s.best_win_streak >= 3, 3), ('streak5', s.best_win_streak >= 5, 5),
    ('friends5', coalesce(array_length(s.beaten, 1), 0) >= 5, 5),
    ('own25', owned >= 25, 1), ('own50', owned >= 50, 2), ('own100', owned >= 100, 3), ('own200', owned >= 200, 5),
    ('set50', total > 0 and owned * 2 >= total, 3), ('set100', total > 0 and owned >= total, 10),
    ('allC', tot_c > 0 and own_c >= tot_c, 3), ('allR', tot_r > 0 and own_r >= tot_r, 5),
    ('leg1', legs >= 1, 2), ('leg5', legs >= 5, 5), ('secret', ones >= 1, 10), ('theme', theme, 3),
    ('all', total > 0 and owned >= total, 0),
    ('open1', s.boosters_opened >= 1, 1), ('open10', s.boosters_opened >= 10, 1), ('open50', s.boosters_opened >= 50, 2),
    ('open100', s.boosters_opened >= 100, 3), ('open500', s.boosters_opened >= 500, 5),
    ('open1000', s.boosters_opened >= 1000, 8), ('open2000', s.boosters_opened >= 2000, 10),
    ('firstUR', urs >= 1, 1), ('firstL', legs >= 1, 2), ('firstS', ones >= 1, 10),
    ('batch10', s.best_batch >= 10, 2), ('twoL', s.two_legends, 5), ('dry20', s.max_dry_streak >= 20, 3),
    ('god', s.god_packs >= 1, 10)
  ) as v(code, ok, reward) loop
    if rec.ok and not exists (select 1 from public.achievements a where a.user_id = uid and a.code = rec.code) then
      insert into public.achievements (user_id, code) values (uid, rec.code);
      gain := gain + rec.reward;
      fresh := fresh || json_build_object('code', rec.code, 'reward', rec.reward);
    end if;
  end loop;
  if gain > 0 then update public.profiles set boosters = boosters + gain where id = uid; end if;
  return array_to_json(fresh);
end $$;

-- =====================================================================
-- Game Master (réservé au propriétaire) : cartes de n'importe qui, remise à zéro réversible
-- =====================================================================

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

create or replace function public.gm_uid(target text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_owner() then raise exception 'Réservé au propriétaire.'; end if;
  select id into uid from public.profiles where username = lower(target);
  if uid is null then raise exception 'Joueur introuvable.'; end if;
  return uid;
end $$;

-- Collection d'un joueur.
create or replace function public.gm_collection(target text) returns table (card_id text, qty int)
language sql stable security definer set search_path = public as $$
  select c.card_id, c.qty from public.collection c where c.user_id = public.gm_uid(target);
$$;

-- Donne (delta > 0) ou retire (delta < 0) des exemplaires d'une carte. Renvoie la nouvelle quantité.
create or replace function public.gm_add_card(target text, cid text, delta int) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.gm_uid(target);
  n int;
begin
  if not exists (select 1 from public.cards where id = cid) then raise exception 'Carte introuvable.'; end if;
  if delta > 0 then perform public.queue_reveal(uid, cid, delta);
  else
    delete from public.pending_reveals where user_id = uid and card_id = cid and qty + delta <= 0;
    update public.pending_reveals set qty = qty + delta where user_id = uid and card_id = cid;
  end if;
  select coalesce(max(qty), 0) + delta into n from public.collection where user_id = uid and card_id = cid;
  if n <= 0 then
    delete from public.collection where user_id = uid and card_id = cid;
    return 0;
  end if;
  insert into public.collection (user_id, card_id, qty) values (uid, cid, n)
    on conflict (user_id, card_id) do update set qty = excluded.qty;
  return n;
end $$;

-- Remet à zéro la collection d'un joueur, après l'avoir sauvegardée. Renvoie le numéro de la sauvegarde.
create or replace function public.gm_reset_collection(target text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.gm_uid(target);
  bid bigint;
begin
  insert into public.collection_backups (user_id, username, cards)
    select uid, lower(target), coalesce(jsonb_object_agg(card_id, qty), '{}') from public.collection where user_id = uid
    returning id into bid;
  delete from public.collection where user_id = uid;
  delete from public.pending_reveals where user_id = uid;
  return bid;
end $$;

-- Rend une collection sauvegardée (les cartes s'ajoutent à ce que le joueur possède aujourd'hui).
create or replace function public.gm_restore_backup(bid bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  b public.collection_backups;
  n int := 0;
begin
  if not public.is_owner() then raise exception 'Réservé au propriétaire.'; end if;
  select * into b from public.collection_backups where id = bid;
  if not found then raise exception 'Sauvegarde introuvable.'; end if;
  insert into public.collection (user_id, card_id, qty)
    select b.user_id, k, v::int from jsonb_each_text(b.cards) e(k, v) where exists (select 1 from public.cards where id = k)
    on conflict (user_id, card_id) do update set qty = public.collection.qty + excluded.qty;
  get diagnostics n = row_count;
  update public.collection_backups set restored_at = now() where id = bid;
  return n;
end $$;

-- Liste des sauvegardes (les plus récentes d'abord).
create or replace function public.gm_backups() returns table (id bigint, username text, nb int, total int, created_at timestamptz, restored_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Réservé au propriétaire.'; end if;
  return query select b.id, b.username, (select count(*)::int from jsonb_object_keys(b.cards)),
    (select coalesce(sum(v::int), 0)::int from jsonb_each_text(b.cards) e(k, v)), b.created_at, b.restored_at
    from public.collection_backups b order by b.created_at desc;
end $$;

-- ---------- Droits d'accès (l'exposition automatique des tables est désactivée) ----------

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select on public.profiles, public.collection, public.stats, public.achievements to authenticated;
grant select, insert, update, delete on public.cards, public.starter_decks, public.decks to authenticated;
grant select, delete on public.invites to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.booster_status(), public.open_booster(), public.one_of_one_owners(),
  public.claim_starter(text), public.admin_give_boosters(text, int), public.admin_set_role(text, text),
  public.admin_create_invite(text, text, int), public.is_revealed(text), public.open_boosters(int),
  public.record_game(boolean, text, int, boolean), public.check_achievements(),
  public.is_owner(), public.gm_collection(text), public.gm_add_card(text, text, int), public.gm_reset_collection(text),
  public.gm_restore_backup(bigint), public.gm_backups(), public.take_reveals(),
  public.admin_create_surprise(text, text, int), public.admin_prepare_surprise(text, text, int), public.admin_surprise_go(text),
  public.admin_surprise_list(), public.surprise_done(), public.admin_reset_test(text, text, int),
  public.admin_set_packs(text, jsonb), public.open_surprise_pack(int),
  public.game_ping(text, text, text, text), public.admin_live_games()
  to authenticated;
grant usage on schema public to anon;
grant execute on function public.invite_info(text) to anon, authenticated;

-- ---------- Images des cartes (stockage PRIVÉ : visibles seulement par les joueurs connectés) ----------
-- Le site demande des adresses temporaires (« signées ») pour afficher les images.

insert into storage.buckets (id, name, public) values ('cards', 'cards', false) on conflict (id) do nothing;
update storage.buckets set public = false where id = 'cards';

drop policy if exists "images cartes lecture joueurs" on storage.objects;
create policy "images cartes lecture joueurs" on storage.objects for select to authenticated
  using (bucket_id = 'cards');

drop policy if exists "images cartes admin ajout" on storage.objects;
create policy "images cartes admin ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'cards' and public.is_admin());
drop policy if exists "images cartes admin suppression" on storage.objects;
create policy "images cartes admin suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'cards' and public.is_admin());
