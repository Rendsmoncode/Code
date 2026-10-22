// Données du jeu, stockées sur Supabase (cartes, collections, decks, boosters), avec cache en mémoire.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://bhhakcbodwtmopstgetu.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_sJAG-LMddGRv-6KU2rij_Q_QPPX50U_';
const EMAIL_DOMAIN = 'joueurs.optcg-maison.fr'; // adresses internes : les joueurs se connectent avec un pseudo

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export const S = {
  user: null, status: null, cards: [], byId: {}, collection: {}, decks: [], starters: [],
};
export const isAdmin = () => ['admin', 'owner'].includes(S.status?.role);
export const isOwner = () => S.status?.role === 'owner';

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

function check({ data, error }) {
  if (error) throw new Error(friendly(error.message));
  return data;
}

function friendly(m = '') {
  if (/Invalid login credentials/i.test(m)) return 'Pseudo ou mot de passe incorrect.';
  if (/already registered|already exists/i.test(m)) return 'Ce pseudo est déjà pris.';
  if (/Password should be/i.test(m)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Impossible de joindre le serveur. Vérifiez votre connexion Internet.';
  if (/Database error saving new user/i.test(m)) return 'Pseudo invalide (3 à 20 caractères : lettres, chiffres, - ou _).';
  return m;
}

// ---------- comptes ----------
const emailOf = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export async function signIn(username, password) {
  check(await sb.auth.signInWithPassword({ email: emailOf(username), password }));
}

export async function signUp(username, password) {
  const u = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,20}$/.test(u)) throw new Error('Pseudo invalide (3 à 20 caractères : lettres, chiffres, - ou _).');
  const data = check(await sb.auth.signUp({ email: emailOf(u), password, options: { data: { username: u } } }));
  if (!data.session) throw new Error('Compte créé, mais la confirmation par e-mail est activée sur Supabase : le propriétaire doit la désactiver.');
}

export async function signOut() {
  await sb.auth.signOut();
  location.reload();
}

export async function currentUser() {
  const { data } = await sb.auth.getSession();
  S.user = data.session?.user || null;
  return S.user;
}

// ---------- chargement ----------
const fromRow = (r) => ({ ...r.data, id: r.id, rarity: r.rarity, inBoosters: r.in_boosters });

function reindex() {
  S.cards.sort((a, b) => (a.code || '').localeCompare(b.code || '') || (a.name || '').localeCompare(b.name || ''));
  S.byId = Object.fromEntries(S.cards.map((c) => [c.id, c]));
}

export async function load() {
  const [status, cards, coll, decks, starters] = await Promise.all([
    sb.rpc('booster_status'),
    sb.from('cards').select('*'),
    sb.from('collection').select('card_id, qty'),
    sb.from('decks').select('*'),
    sb.from('starter_decks').select('*'),
  ]);
  S.status = check(status);
  S.cards = check(cards).map(fromRow);
  S.collection = Object.fromEntries(check(coll).map((r) => [r.card_id, r.qty]));
  S.decks = check(decks);
  S.starters = check(starters);
  reindex();
  emit();
}

export async function refreshStatus() {
  S.status = check(await sb.rpc('booster_status'));
  S.status.offset = new Date(S.status.now).getTime() - Date.now(); // décalage horloge serveur / PC
  emit();
  return S.status;
}

async function refreshCollection() {
  S.collection = Object.fromEntries(check(await sb.from('collection').select('card_id, qty')).map((r) => [r.card_id, r.qty]));
}

// ---------- cartes (admins) ----------
async function uploadImage(card) {
  if (!card.image?.startsWith('data:')) return card.image;
  const blob = await (await fetch(card.image)).blob();
  const path = `${card.id}-${Date.now()}.jpg`;
  check(await sb.storage.from('cards').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
  return sb.storage.from('cards').getPublicUrl(path).data.publicUrl;
}

function oldImagePath(url) {
  const m = /\/object\/public\/cards\/(.+)$/.exec(url || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function saveCards(cards) {
  for (const c of cards) {
    const prev = S.byId[c.id]?.image;
    const image = await uploadImage(c);
    const { id, rarity, inBoosters, ...data } = { ...c, image };
    check(await sb.from('cards').upsert({
      id, data, rarity: rarity || 'C', in_boosters: inBoosters !== false, updated_at: new Date().toISOString(),
    }));
    c.image = image;
    const old = prev !== image && oldImagePath(prev);
    if (old) await sb.storage.from('cards').remove([old]);
    const i = S.cards.findIndex((x) => x.id === c.id);
    const saved = { ...c, image, rarity: rarity || 'C', inBoosters: inBoosters !== false };
    if (i >= 0) S.cards[i] = saved; else S.cards.push(saved);
  }
  reindex();
  emit();
}
export const saveCard = (c) => saveCards([c]);

export async function deleteCard(id) {
  const old = oldImagePath(S.byId[id]?.image);
  check(await sb.from('cards').delete().eq('id', id));
  if (old) await sb.storage.from('cards').remove([old]);
  S.cards = S.cards.filter((c) => c.id !== id);
  reindex();
  emit();
}

// ---------- decks ----------
// kind : 'decks' (decks du joueur) ou 'starter_decks' (decks préconstruits, admins)
const listOf = (kind) => (kind === 'starter_decks' ? S.starters : S.decks);

export async function saveDeck(d, kind = 'decks') {
  const row = { id: d.id, name: d.name, leader: d.leader || null, cards: d.cards, updated_at: new Date().toISOString() };
  const saved = check(await sb.from(kind).upsert(row).select().single());
  const list = listOf(kind);
  const i = list.findIndex((x) => x.id === d.id);
  if (i >= 0) list[i] = saved; else list.push(saved);
  emit();
}

export async function deleteDeck(id, kind = 'decks') {
  check(await sb.from(kind).delete().eq('id', id));
  if (kind === 'starter_decks') S.starters = S.starters.filter((d) => d.id !== id);
  else S.decks = S.decks.filter((d) => d.id !== id);
  emit();
}

// owned = true : vérifie aussi que le joueur possède les cartes.
export function validateDeck(deck, { owned = true } = {}) {
  const errs = [];
  const leader = S.byId[deck.leader];
  if (!leader) errs.push('Choisissez un Leader.');
  else if (owned && !S.collection[leader.id]) errs.push(`Vous ne possédez pas le Leader « ${leader.name} ».`);
  let total = 0;
  const perCode = {};
  for (const [id, n] of Object.entries(deck.cards || {})) {
    const c = S.byId[id];
    if (!c) { errs.push('Une carte du deck n\'existe plus.'); continue; }
    total += n;
    const key = c.code || c.id;
    perCode[key] = (perCode[key] || 0) + n;
    if (perCode[key] > 4) errs.push(`« ${c.name} » : 4 exemplaires maximum.`);
    if (owned && n > (S.collection[id] || 0)) errs.push(`« ${c.name} » : vous n'en possédez que ${S.collection[id] || 0}.`);
    if (c.type === 'leader') errs.push(`« ${c.name} » est un Leader : il ne va pas dans le deck.`);
    if (leader && !c.colors.some((x) => leader.colors.includes(x))) {
      errs.push(`« ${c.name} » n'a aucune couleur du Leader.`);
    }
  }
  if (total !== 50) errs.push(`Le deck contient ${total} cartes : il en faut exactement 50.`);
  return { ok: errs.length === 0, errs: [...new Set(errs)], total };
}

// ---------- boosters ----------
export async function openBooster() {
  const pulls = check(await sb.rpc('open_booster'));
  await refreshCollection();
  await refreshStatus();
  return pulls;
}

export async function claimStarter(id) {
  check(await sb.rpc('claim_starter', { starter_id: id }));
  await load();
}

// ---------- administration ----------
export async function listPlayers() {
  return check(await sb.from('profiles').select('username, role, boosters, created_at').order('username'));
}

export async function giveBoosters(target, amount) {
  const n = check(await sb.rpc('admin_give_boosters', { target: target || null, amount }));
  await refreshStatus();
  return n;
}

export async function setRole(target, role) {
  check(await sb.rpc('admin_set_role', { target, new_role: role }));
}
