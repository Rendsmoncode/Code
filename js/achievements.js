// Succès : liste, progression, page « Succès » et notifications.
// Les conditions sont vérifiées par le serveur (check_achievements dans supabase/setup.sql, mêmes codes).
import { S, loadStats, checkAchievements, recordGameResult, refreshStatus } from './store.js';
import { esc } from './cards.js';
import { icon } from './icons.js';

const CATS = { battle: 'Bataille', coll: 'Collection', open: 'Ouverture' };

// prog(m) renvoie [valeur actuelle, objectif]. secret : nom et description cachés tant que le succès n'est pas obtenu.
const N = (n, t) => (m) => [m[n] || 0, t];
export const ACHIEVEMENTS = [
  { code: 'win1', cat: 'battle', name: 'Première victoire', desc: 'Gagner une partie.', reward: 1, prog: N('wins', 1) },
  { code: 'win10', cat: 'battle', name: '10 victoires', desc: 'Gagner 10 parties.', reward: 3, prog: N('wins', 10) },
  { code: 'win20', cat: 'battle', name: '20 victoires', desc: 'Gagner 20 parties.', reward: 5, prog: N('wins', 20) },
  { code: 'games10', cat: 'battle', name: 'Habitué', desc: 'Jouer 10 parties.', reward: 2, prog: N('games', 10) },
  { code: 'games50', cat: 'battle', name: 'Vétéran', desc: 'Jouer 50 parties.', reward: 5, prog: N('games', 50) },
  { code: 'perfect', cat: 'battle', name: 'Victoire parfaite', desc: 'Gagner sans perdre une seule Vie.', reward: 3, prog: N('perfect_wins', 1) },
  { code: 'comeback', cat: 'battle', name: 'Remontada', desc: 'Gagner avec 0 Vie restante.', reward: 3, prog: N('comeback_wins', 1) },
  { code: 'streak3', cat: 'battle', name: 'En forme', desc: 'Gagner 3 parties d\'affilée.', reward: 3, prog: N('best_win_streak', 3) },
  { code: 'streak5', cat: 'battle', name: 'Inarrêtable', desc: 'Gagner 5 parties d\'affilée.', reward: 5, prog: N('best_win_streak', 5) },
  { code: 'friends5', cat: 'battle', name: 'Tournée des nakamas', desc: 'Battre 5 amis différents.', reward: 5, prog: N('beaten', 5) },

  { code: 'own25', cat: 'coll', name: 'Collectionneur', desc: 'Posséder 25 cartes différentes.', reward: 1, prog: N('owned', 25) },
  { code: 'own50', cat: 'coll', name: 'Classeur', desc: 'Posséder 50 cartes différentes.', reward: 2, prog: N('owned', 50) },
  { code: 'own100', cat: 'coll', name: 'Bibliothèque', desc: 'Posséder 100 cartes différentes.', reward: 3, prog: N('owned', 100) },
  { code: 'own200', cat: 'coll', name: 'Archiviste', desc: 'Posséder 200 cartes différentes.', reward: 5, prog: N('owned', 200) },
  { code: 'set50', cat: 'coll', name: 'SB01 à moitié', desc: 'Posséder la moitié des cartes du set SB01.', reward: 3, prog: (m) => [m.owned, Math.ceil(m.total / 2)] },
  { code: 'set100', cat: 'coll', name: 'SB01 complet', desc: 'Posséder toutes les cartes du set SB01.', reward: 10, prog: (m) => [m.owned, m.total] },
  { code: 'allC', cat: 'coll', name: 'Toutes les Communes', desc: 'Posséder toutes les Communes.', reward: 3, prog: (m) => [m.ownC, m.totC] },
  { code: 'allR', cat: 'coll', name: 'Toutes les Rares', desc: 'Posséder toutes les Rares.', reward: 5, prog: (m) => [m.ownR, m.totR] },
  { code: 'leg1', cat: 'coll', name: 'Première Légende', desc: 'Posséder une Légendaire.', reward: 2, prog: N('legs', 1) },
  { code: 'leg5', cat: 'coll', name: 'Panthéon', desc: 'Posséder 5 Légendaires.', reward: 5, prog: N('legs', 5) },
  { code: 'secret', cat: 'coll', name: 'Posséder ???', desc: '???', reward: 10, secret: 'Posséder une carte 1on1.' },
  { code: 'theme', cat: 'coll', name: 'Thème complet', desc: 'Posséder toutes les cartes d\'un même type (5 cartes ou plus).', reward: 3 },
  { code: 'all', cat: 'coll', name: 'Posséder TOUTES les cartes', desc: 'Toutes les cartes du jeu, sans exception.', reward: '1000 €', prog: (m) => [m.owned, m.total] },

  { code: 'open1', cat: 'open', name: 'Premier booster', desc: 'Ouvrir un booster.', reward: 1, prog: N('boosters_opened', 1) },
  ...[10, 50, 100, 500, 1000, 2000].map((n, i) => ({
    code: `open${n}`, cat: 'open', name: `${n.toLocaleString('fr-FR')} boosters`, desc: `Ouvrir ${n.toLocaleString('fr-FR')} boosters.`,
    reward: [1, 2, 3, 5, 8, 10][i], prog: N('boosters_opened', n),
  })),
  { code: 'firstUR', cat: 'open', name: 'Première UR', desc: 'Obtenir une Ultra rare.', reward: 1, prog: N('urs', 1) },
  { code: 'firstL', cat: 'open', name: 'Première Légendaire', desc: 'Obtenir une Légendaire.', reward: 2, prog: N('legs', 1) },
  { code: 'firstS', cat: 'open', name: 'Première ???', desc: '???', reward: 10, secret: 'Tirer une carte 1on1.' },
  { code: 'batch10', cat: 'open', name: 'Gros joueur', desc: 'Ouvrir 10 boosters d\'un coup.', reward: 2, prog: N('best_batch', 10) },
  { code: 'twoL', cat: 'open', name: 'Doublé légendaire', desc: 'Deux Légendaires dans la même ouverture.', reward: 5 },
  { code: 'dry20', cat: 'open', name: 'La poisse', desc: '20 boosters d\'affilée sans SR ou mieux.', reward: 3, prog: N('max_dry_streak', 20) },
  { code: 'god', cat: 'open', name: 'God Pack', desc: 'Tomber sur un God Pack.', reward: 10 },
];
const BY = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]));

function metrics() {
  const st = S.stats || {};
  const mine = S.cards.filter((c) => S.collection[c.id]);
  const pool = S.cards.filter((c) => c.inBoosters !== false && c.rarity !== 'S');
  const own = (f) => mine.filter((c) => c.inBoosters !== false && f(c)).length;
  return {
    ...st, beaten: (st.beaten || []).length,
    owned: own((c) => c.rarity !== 'S'), total: pool.length,
    ownC: own((c) => c.rarity === 'C'), totC: pool.filter((c) => c.rarity === 'C').length,
    ownR: own((c) => c.rarity === 'R'), totR: pool.filter((c) => c.rarity === 'R').length,
    legs: mine.filter((c) => c.rarity === 'L').length, urs: mine.filter((c) => c.rarity === 'UR').length,
  };
}

const rewardText = (r) => (typeof r === 'number' ? `${r} booster${r > 1 ? 's' : ''}` : r);

// ---------- notifications ----------
function toast(a, reward) {
  let box = document.querySelector('.ach-toasts');
  if (!box) { box = document.createElement('div'); box.className = 'ach-toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'ach-toast';
  t.innerHTML = `<span class="tt-ico">${icon('trophy')}</span><div><small>Succès débloqué</small><b>${esc(a?.name || '')}</b>
    ${reward ? `<span>+ ${esc(rewardText(reward))}</span>` : ''}</div>`;
  box.append(t);
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4700);
}

let render = () => {};

// À appeler après une ouverture, une partie, au démarrage : débloque, crédite et prévient.
export async function refreshAchievements() {
  const fresh = await checkAchievements();
  await loadStats();
  fresh.forEach((f, i) => setTimeout(() => toast(BY[f.code], BY[f.code]?.reward === '1000 €' ? '1000 €' : f.reward), i * 700));
  if (fresh.length) await refreshStatus();
  render();
  return fresh;
}

export async function recordGame({ won, opponent, livesLeft, perfect }) {
  if (await recordGameResult(won, opponent, livesLeft, perfect)) await refreshAchievements();
}

// ---------- page « Succès » ----------
export function initAchievements() {
  const el = document.getElementById('tab-achievements');
  let cat = 'battle';
  render = () => {
    const m = metrics();
    const got = S.achievements || {};
    const done = ACHIEVEMENTS.filter((a) => got[a.code]).length;
    el.innerHTML = `<div class="ach">
      <div class="ach-head"><h2>Succès</h2><span>${done} / ${ACHIEVEMENTS.length}</span></div>
      ${S.stats === null ? '<p class="msg err">Les succès seront actifs dès que le script SQL aura été relancé dans Supabase.</p>' : ''}
      <div class="ach-cats">${Object.entries(CATS).map(([k, v]) => {
        const list = ACHIEVEMENTS.filter((a) => a.cat === k);
        return `<button data-cat="${k}" class="${k === cat ? 'on' : ''}">${v} <small>${list.filter((a) => got[a.code]).length}/${list.length}</small></button>`;
      }).join('')}</div>
      <div class="ach-list">${ACHIEVEMENTS.filter((a) => a.cat === cat).map((a) => {
        const ok = !!got[a.code];
        const [cur, max] = a.prog && max0(a.prog(m)) ? a.prog(m) : [ok ? 1 : 0, 1];
        const pct = ok ? 100 : Math.min(100, Math.floor((100 * cur) / (max || 1)));
        const hidden = a.secret && !ok;
        return `<div class="ach-item ${ok ? 'ok' : ''} ${hidden ? 'hidden' : ''}">
          <span class="ach-ico">${icon(ok ? 'trophy' : hidden ? 'lock' : 'trophy')}</span>
          <div class="ach-txt"><b>${esc(a.name)}</b><small>${esc(ok && a.secret ? a.secret : a.desc)}</small>
            ${a.prog && !ok ? `<div class="bar"><i style="width:${pct}%"></i></div><small class="ach-num">${Math.min(cur, max)} / ${max}</small>` : ''}
            ${ok ? `<small class="ach-date">Obtenu le ${new Date(got[a.code]).toLocaleDateString('fr-FR')}</small>` : ''}</div>
          <span class="ach-rew">${icon(typeof a.reward === 'number' ? 'pack' : 'star')}${esc(rewardText(a.reward))}</span></div>`;
      }).join('')}</div></div>`;
  };
  const max0 = ([, max]) => max > 0;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (b) { cat = b.dataset.cat; render(); }
  });
  render();
  refreshAchievements();
}
