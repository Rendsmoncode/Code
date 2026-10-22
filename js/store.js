// Stockage local (IndexedDB) des cartes et des decks, avec cache en mémoire.

const DB_NAME = 'optcg-maison';
let dbPromise;

function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('cards', { keyPath: 'id' });
      r.result.createObjectStore('decks', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const S = { cards: [], decks: [], byId: {} };
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

function reindex() {
  S.cards.sort((a, b) => (a.code || '').localeCompare(b.code || '') || (a.name || '').localeCompare(b.name || ''));
  S.byId = Object.fromEntries(S.cards.map((c) => [c.id, c]));
}

export async function load() {
  S.cards = (await run('cards', 'readonly', (s) => s.getAll())) || [];
  S.decks = (await run('decks', 'readonly', (s) => s.getAll())) || [];
  reindex();
}

export async function saveCards(cards) {
  await run('cards', 'readwrite', (s) => { cards.forEach((c) => s.put(c)); });
  for (const c of cards) {
    const i = S.cards.findIndex((x) => x.id === c.id);
    if (i >= 0) S.cards[i] = c; else S.cards.push(c);
  }
  reindex();
  emit();
}
export const saveCard = (c) => saveCards([c]);

export async function deleteCard(id) {
  await run('cards', 'readwrite', (s) => s.delete(id));
  S.cards = S.cards.filter((c) => c.id !== id);
  reindex();
  emit();
}

export async function saveDeck(d) {
  await run('decks', 'readwrite', (s) => s.put(d));
  const i = S.decks.findIndex((x) => x.id === d.id);
  if (i >= 0) S.decks[i] = d; else S.decks.push(d);
  emit();
}

export async function deleteDeck(id) {
  await run('decks', 'readwrite', (s) => s.delete(id));
  S.decks = S.decks.filter((d) => d.id !== id);
  emit();
}

export function validateDeck(deck) {
  const errs = [];
  const leader = S.byId[deck.leader];
  if (!leader) errs.push('Choisissez un Leader.');
  let total = 0;
  const perCode = {};
  for (const [id, n] of Object.entries(deck.cards || {})) {
    const c = S.byId[id];
    if (!c) { errs.push('Une carte du deck n\'existe plus dans la collection.'); continue; }
    total += n;
    const key = c.code || c.id;
    perCode[key] = (perCode[key] || 0) + n;
    if (perCode[key] > 4) errs.push(`« ${c.name} » : 4 exemplaires maximum.`);
    if (c.type === 'leader') errs.push(`« ${c.name} » est un Leader : il ne va pas dans le deck.`);
    if (leader && !c.colors.some((x) => leader.colors.includes(x))) {
      errs.push(`« ${c.name} » n'a aucune couleur du Leader.`);
    }
  }
  if (total !== 50) errs.push(`Le deck contient ${total} cartes : il en faut exactement 50.`);
  return { ok: errs.length === 0, errs: [...new Set(errs)], total };
}
