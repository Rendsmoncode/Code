// Données du jeu, stockées sur Supabase (cartes, collections, decks, boosters), avec cache en mémoire.
import { createClient } from '@supabase/supabase-js';
import { setImageResolver } from './cards.js';

export const SUPABASE_URL = 'https://bhhakcbodwtmopstgetu.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_sJAG-LMddGRv-6KU2rij_Q_QPPX50U_';
const EMAIL_DOMAIN = 'joueurs.optcg-maison.fr'; // adresses internes : les joueurs se connectent avec un pseudo

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export const S = {
  user: null, status: null, cards: [], byId: {}, collection: {}, decks: [], starters: [], oneOfOne: {}, stats: null, achievements: {},
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
  if (/Database error saving new user/i.test(m)) return 'Inscription impossible : il faut le lien d\'invitation personnel reçu, avec le pseudo prévu.';
  return m;
}

// ---------- comptes ----------
const emailOf = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export async function signIn(username, password) {
  check(await sb.auth.signInWithPassword({ email: emailOf(username), password }));
}

// invite : jeton du lien d'invitation personnel (obligatoire, sauf pour le tout premier compte).
export async function signUp(username, password, invite = null) {
  const u = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,20}$/.test(u)) throw new Error('Pseudo invalide (3 à 20 caractères : lettres, chiffres, - ou _).');
  const meta = invite ? { username: u, invite } : { username: u };
  const data = check(await sb.auth.signUp({ email: emailOf(u), password, options: { data: meta } }));
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

// Toutes les familles (types) utilisées sur les cartes du jeu, triées.
export function allTraits() {
  const set = new Set();
  for (const c of S.cards) String(c.traits || '').split('/').map((t) => t.trim()).filter(Boolean).forEach((t) => set.add(t));
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}

// Liste <datalist id="all-traits"> pour proposer les familles existantes dans les champs « Type ».
function refreshTraitsList() {
  let dl = document.getElementById('all-traits');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'all-traits'; document.body.append(dl); }
  dl.innerHTML = allTraits().map((t) => `<option value="${t.replace(/"/g, '&quot;')}">`).join('');
}
listeners.add(refreshTraitsList);

// ---------- images privées : adresses temporaires (« signées ») ----------
// Gardées 7 jours, et mémorisées dans le navigateur pour ne pas retélécharger les images à chaque visite.
const SIGN_SECONDS = 7 * 24 * 3600;
const SIGN_KEY = 'optcgm-signed';
let signed = {};
try { signed = JSON.parse(localStorage.getItem(SIGN_KEY) || '{}'); } catch { signed = {}; }
setImageResolver((url) => {
  const p = oldImagePath(url);
  return (p && signed[p]?.url) || url;
});
async function signImages(paths) {
  const soon = Date.now() + 24 * 3600e3; // renouveler quand il reste moins d'un jour
  const todo = [...new Set(paths.filter(Boolean))].filter((p) => !(signed[p]?.exp > soon));
  for (let i = 0; i < todo.length; i += 100) {
    const { data, error } = await sb.storage.from('cards').createSignedUrls(todo.slice(i, i + 100), SIGN_SECONDS);
    if (error) { console.warn(error); return; }
    for (const r of data || []) if (r.signedUrl) signed[r.path] = { url: r.signedUrl, exp: Date.now() + SIGN_SECONDS * 1000 };
  }
  try { localStorage.setItem(SIGN_KEY, JSON.stringify(signed)); } catch { /* stockage plein : tant pis */ }
}

export async function load() {
  const [status, cards, coll, decks, starters, owners] = await Promise.all([
    sb.rpc('booster_status'),
    sb.from('cards').select('*'),
    sb.from('collection').select('card_id, qty'),
    sb.from('decks').select('*'),
    sb.from('starter_decks').select('*'),
    sb.rpc('one_of_one_owners'),
  ]);
  S.status = check(status);
  S.cards = check(cards).map(fromRow);
  S.collection = Object.fromEntries(check(coll).map((r) => [r.card_id, r.qty]));
  S.decks = check(decks);
  S.starters = check(starters);
  // Tolérant : la fonction n'existe pas tant que le script SQL n'a pas été relancé.
  S.oneOfOne = Object.fromEntries((owners.error ? [] : owners.data || []).map((r) => [r.card_id, r.username]));
  await signImages(S.cards.map((c) => oldImagePath(c.image)));
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
    await signImages([oldImagePath(image)]);
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
  else if (!owned && leader.rarity === 'S') errs.push(`« ${leader.name} » est une 1on1 : interdite dans un deck préconstruit.`);
  let total = 0;
  const perCode = {};
  for (const [id, n] of Object.entries(deck.cards || {})) {
    const c = S.byId[id];
    if (!c) { errs.push('Une carte du deck n\'existe plus.'); continue; }
    total += n;
    const key = c.code || c.id;
    perCode[key] = (perCode[key] || 0) + n;
    if (perCode[key] > 4 && !c.keywords?.includes('unlimited')) errs.push(`« ${c.name} » : 4 exemplaires maximum.`);
    if (owned && n > (S.collection[id] || 0)) errs.push(`« ${c.name} » : vous n'en possédez que ${S.collection[id] || 0}.`);
    if (c.type === 'leader') errs.push(`« ${c.name} » est un Leader : il ne va pas dans le deck.`);
    if (!owned && c.rarity === 'S') errs.push(`« ${c.name} » est une 1on1 : interdite dans un deck préconstruit.`);
    if (leader && !c.colors.some((x) => leader.colors.includes(x))) {
      errs.push(`« ${c.name} » n'a aucune couleur du Leader.`);
    }
  }
  if (total !== 50) errs.push(`Le deck contient ${total} cartes : il en faut exactement 50.`);
  return { ok: errs.length === 0, errs: [...new Set(errs)], total };
}

// ---------- boosters ----------
// Ouvre n boosters d'un coup (10 au maximum). Si l'un échoue, on garde les cartes déjà tirées.
export async function openBoosters(n = 1) {
  n = Math.max(1, Math.min(10, n));
  let pulls = [];
  let error = null;
  const many = await sb.rpc('open_boosters', { n });
  if (!many.error) pulls = many.data || [];
  else if (/open_boosters/.test(many.error.message || '')) {
    // Script SQL pas encore relancé : on ouvre les boosters un par un.
    for (let i = 0; i < n; i++) {
      try { pulls.push(...check(await sb.rpc('open_booster'))); } catch (e) { error = e; break; }
    }
  } else error = new Error(many.error.message);
  if (!pulls.length && error) throw error;
  if (pulls.length < n * 5 && !error) error = new Error('Plus assez de boosters.');
  // Une carte 1on1 tirée devient visible : on recharge les cartes pour l'afficher.
  if (pulls.some((p) => !S.byId[p.id])) {
    S.cards = check(await sb.from('cards').select('*')).map(fromRow);
    await signImages(S.cards.map((c) => oldImagePath(c.image)));
    reindex();
  }
  await refreshCollection();
  if (pulls.some((p) => S.byId[p.id]?.rarity === 'S')) {
    S.oneOfOne = Object.fromEntries((check(await sb.rpc('one_of_one_owners')) || []).map((r) => [r.card_id, r.username]));
  }
  await refreshStatus();
  return { pulls, error };
}

// ---------- succès ----------
// Statistiques du joueur (null si le script SQL n'a pas encore été relancé).
export async function loadStats() {
  const r = await sb.from('stats').select('*').maybeSingle();
  const a = await sb.from('achievements').select('code, unlocked_at');
  S.stats = r.error ? null : r.data || {};
  S.achievements = a.error ? {} : Object.fromEntries((a.data || []).map((x) => [x.code, x.unlocked_at]));
  return S.stats;
}

// Vérifie les succès côté serveur : renvoie ceux débloqués à l'instant (les boosters gagnés sont déjà crédités).
export async function checkAchievements() {
  const r = await sb.rpc('check_achievements');
  if (r.error) return [];
  return r.data || [];
}

export async function recordGameResult(won, opponent, livesLeft, perfect) {
  const r = await sb.rpc('record_game', { won, opponent: opponent || '', lives_left: livesLeft, perfect });
  return !r.error;
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

// ---------- invitations ----------
export const inviteLink = (token) => `${location.origin}${location.pathname}?invite=${token}`;
export async function inviteInfo(token) {
  const { data, error } = await sb.rpc('invite_info', { t: token });
  return error ? null : data;
}
export async function listInvites() {
  return check(await sb.from('invites').select('*').order('created_at', { ascending: false }));
}
export async function createInvite(username, starterId, boosters) {
  return check(await sb.rpc('admin_create_invite', { uname: username, starter: starterId || '', nb: boosters }));
}
export async function deleteInvite(token) {
  check(await sb.from('invites').delete().eq('token', token));
}

export async function setRole(target, role) {
  check(await sb.rpc('admin_set_role', { target, new_role: role }));
}
