// Onglets « Boosters » (ouverture) et « Collection ».
import { S, openBooster, refreshStatus, onChange } from './store.js';
import { RARITIES, RARITY_ORDER, TYPES, esc, cardHTML } from './cards.js';
import { logoSVG } from './logo.js';

const RATES = [
  ['3 cartes', 'Commune'],
  ['1 carte', 'Peu commune'],
  ['1 carte', 'Rare ou mieux : 1 Super rare (SR) tous les 4 boosters, 1 Ultra rare (UR) tous les 15, 1 Légendaire (LR) tous les 50, 1 « 1on1 » tous les 2 000'],
];

let busy = false;
const SPECIAL = { UR: 1100, L: 1700, S: 2600 }; // durée de l'animation d'arrivée (ms) des grosses raretés
const rank = (id) => RARITY_ORDER.indexOf(S.byId[id]?.rarity);

// Paquet de booster (accueil et onglet Boosters).
export function packHTML(cls = '') {
  return `<div class="bpack ${cls}" aria-hidden="true"><div class="bp-seal bp-top"></div>
    <div class="bp-body"><div class="bp-logo">${logoSVG()}</div><div class="bp-sub">Booster · 5 cartes</div></div>
    <div class="bp-seal bp-bot"></div></div>`;
}

// Boosters disponibles et compte à rebours du prochain booster gratuit (calculé localement entre deux synchronisations).
export function boosterState() {
  const st = S.status;
  if (!st) return null;
  const now = Date.now() + (st.offset || 0);
  let { free } = st;
  let next = st.next_free_at ? new Date(st.next_free_at).getTime() : null;
  // Quand le compte à rebours arrive à zéro, on recalcule localement puis on resynchronise.
  while (next && next <= now && free < st.free_max) {
    free++;
    next = free < st.free_max ? next + 600000 : null;
    if (!st.syncing) { st.syncing = true; setTimeout(() => refreshStatus().catch(() => {}), 1500); }
  }
  return { free, next, total: free + st.gifted, left: next ? Math.max(0, Math.ceil((next - now) / 1000)) : 0 };
}
export const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// Ouvre un booster depuis un autre onglet (accueil).
export const openFromHome = () => document.querySelector('#tab-boosters .bs-open')?.click();

export function initBoosters() {
  const el = document.getElementById('tab-boosters');
  el.innerHTML = `
  <div class="boosters">
    <section class="bs-head">
      <div class="bs-pack">${packHTML()}</div>
      <div class="bs-count"></div>
      <p class="bs-detail"></p>
      <button class="btn bs-open">Ouvrir</button>
      <p class="msg bs-msg" role="status"></p>
    </section>
    <details class="bs-rates"><summary>Contenu d'un booster</summary>
      <ul>${RATES.map(([n, r]) => `<li><b>${n}</b> : ${r}</li>`).join('')}</ul>
      <p class="muted">Une carte <b>1on1</b> n'existe qu'en un seul exemplaire dans tout le jeu : le premier qui la tire est le seul à l'avoir.</p>
      <p class="muted">1 booster gratuit toutes les 10 minutes (6 en réserve au maximum), plus les boosters offerts par les admins.</p>
    </details>
  </div>`;
  const q = (s) => el.querySelector(s);

  q('.bs-open').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    q('.bs-msg').textContent = '';
    q('.bs-msg').classList.remove('err');
    q('.bs-open').disabled = true;
    try {
      const pulls = await openBooster();
      // Le paquet se déchire, puis les cartes arrivent une par une, la plus rare en dernier.
      const pack = q('.bpack');
      pack.classList.add('tear');
      await wait(650);
      pack.classList.remove('tear');
      reveal([...pulls].sort((x, y) => rank(x.id) - rank(y.id)));
    } catch (e) {
      q('.bs-msg').textContent = e.message;
      q('.bs-msg').classList.add('err');
      busy = false;
    }
    renderHead();
  });

  // Compte à rebours et rafraîchissement régulier (pour voir arriver les boosters offerts).
  setInterval(renderHead, 1000);
  setInterval(() => { if (!document.hidden) refreshStatus().catch(() => {}); }, 30000);
  onChange(renderHead);
  renderHead();

  function renderHead() {
    const b = boosterState();
    if (!b) return;
    const { next, total, left } = b;
    q('.bs-count').textContent = `${total} booster${total > 1 ? 's' : ''}`;
    q('.bs-detail').innerHTML = next ? `Prochain booster gratuit dans <b>${mmss(left)}</b>` : 'Réserve de boosters gratuits pleine';
    if (S.status.gifted) q('.bs-detail').innerHTML += ` · dont <b>${S.status.gifted}</b> offert${S.status.gifted > 1 ? 's' : ''}`;
    q('.bs-open').disabled = busy || total === 0;
  }

  // Ouverture plein écran : une carte à la fois, on touche la carte pour passer à la suivante.
  function reveal(pulls) {
    const ov = document.createElement('div');
    ov.className = 'bx';
    ov.innerHTML = `<div class="bx-fx"></div><div class="bx-stage"></div><div class="bx-info"></div><div class="bx-hint"></div>`;
    document.body.append(ov);
    const stage = ov.querySelector('.bx-stage');
    let i = -1;
    let lock = false;

    async function next() {
      if (lock) return;
      lock = true;
      const old = stage.querySelector('.bx-card');
      if (old) { old.classList.add('out'); ov.querySelector('.bx-info').innerHTML = ''; await wait(260); old.remove(); }
      i++;
      ov.className = 'bx';
      ov.querySelector('.bx-fx').innerHTML = '';
      if (i >= pulls.length) { summary(); return; }
      const p = pulls[i];
      const c = S.byId[p.id];
      const r = c?.rarity;
      ov.querySelector('.bx-hint').textContent = `${i + 1} / ${pulls.length}`;
      if (SPECIAL[r]) {
        // Animation d'arrivée propre à la rareté, puis la carte apparaît avec son effet.
        ov.classList.add(`fx-${r}`, 'intro');
        ov.querySelector('.bx-fx').innerHTML = fxHTML(r);
        await wait(SPECIAL[r]);
        ov.classList.remove('intro');
      }
      stage.insertAdjacentHTML('beforeend', `<button class="bx-card in r-${r}" aria-label="Carte suivante">${cardHTML(c)}</button>`);
      ov.querySelector('.bx-info').innerHTML = `<span class="rar-chip r-${r}">${RARITIES[r]?.label || ''}</span>${p.new ? '<span class="bx-new">Nouvelle !</span>' : ''}
        ${r === 'S' ? '<div class="bx-unique">Exemplaire unique</div>' : ''}`;
      await wait(SPECIAL[r] ? 500 : 250);
      lock = false;
    }

    function summary() {
      ov.className = 'bx done';
      ov.querySelector('.bx-hint').textContent = '';
      ov.querySelector('.bx-info').innerHTML = '';
      const left = boosterState()?.total || 0;
      stage.innerHTML = `<div class="bx-sum">${pulls.map((p) => {
        const c = S.byId[p.id];
        return `<div class="bx-mini r-${c?.rarity}">${cardHTML(c)}<span class="rar-chip r-${c?.rarity}">${RARITIES[c?.rarity]?.short || ''}</span>${p.new ? '<span class="bx-new">Nouvelle</span>' : ''}</div>`;
      }).join('')}</div>
      <div class="bx-acts">${left ? `<button class="btn main" data-do="again">Ouvrir un autre · ${left}</button>` : ''}<button class="btn ghost" data-do="close">Terminer</button></div>`;
      lock = false;
    }

    ov.addEventListener('click', (e) => {
      const d = e.target.closest('[data-do]')?.dataset.do;
      if (d === 'close' || d === 'again') {
        ov.remove();
        busy = false;
        renderHead();
        if (d === 'again') q('.bs-open').click();
        return;
      }
      if (!ov.classList.contains('done')) next();
    });
    next();
  }
}

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Décor des animations : rayons, éclats, onde arc-en-ciel.
function fxHTML(r) {
  const sparks = (n) => Array.from({ length: n }, () => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 1.6).toFixed(2)}s;--s:${(0.5 + Math.random()).toFixed(2)}"></i>`).join('');
  if (r === 'UR') return '<div class="fx-rays"></div><div class="fx-glow"></div>';
  if (r === 'L') return `<div class="fx-flash"></div><div class="fx-rays"></div><div class="fx-glow"></div><div class="fx-sparks">${sparks(28)}</div>`;
  return `<div class="fx-rays"></div><div class="fx-ring"></div><div class="fx-ring r2"></div><div class="fx-glow"></div><div class="fx-sparks">${sparks(40)}</div>`;
}

export function initCollection() {
  const el = document.getElementById('tab-collection');
  let filter = { own: '', rarity: '', type: '', q: '' };
  el.innerHTML = `
  <section class="panel">
    <div class="list-head"><h2>Ma collection</h2><div class="cl-progress muted"></div></div>
    <div class="cl-rarities"></div>
    <div class="filters">
      <input class="cl-q" type="search" placeholder="Rechercher…" aria-label="Rechercher">
      <select class="cl-own" aria-label="Possession"><option value="">Toutes les cartes</option><option value="yes">Possédées</option><option value="no">Manquantes</option></select>
      <select class="cl-rarity" aria-label="Rareté"><option value="">Toutes raretés</option>${Object.entries(RARITIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
      <select class="cl-type" aria-label="Type"><option value="">Tous types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    </div>
    <div class="card-grid cl-grid"></div>
  </section>`;
  const q = (s) => el.querySelector(s);
  q('.filters').addEventListener('input', () => {
    filter = { q: q('.cl-q').value.toLowerCase(), own: q('.cl-own').value, rarity: q('.cl-rarity').value, type: q('.cl-type').value };
    render();
  });
  onChange(render);
  render();

  function render() {
    const owned = S.cards.filter((c) => S.collection[c.id]);
    q('.cl-progress').textContent = `${owned.length} / ${S.cards.length} cartes différentes`;
    q('.cl-rarities').innerHTML = RARITY_ORDER.map((r) => {
      const all = S.cards.filter((c) => c.rarity === r).length;
      const have = owned.filter((c) => c.rarity === r).length;
      return all ? `<span class="rar-chip r-${r}">${RARITIES[r].label} ${have}/${all}</span>` : '';
    }).join('');
    const list = S.cards.filter((c) => (!filter.rarity || c.rarity === filter.rarity)
      && (!filter.type || c.type === filter.type)
      && (filter.own !== 'yes' || S.collection[c.id])
      && (filter.own !== 'no' || !S.collection[c.id])
      && (!filter.q || `${c.name} ${c.code} ${c.traits} ${c.effect}`.toLowerCase().includes(filter.q)))
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
    q('.cl-grid').innerHTML = list.map((c) => {
      const n = S.collection[c.id] || 0;
      const owner = c.rarity === 'S' ? S.oneOfOne[c.id] : null;
      const tag = c.rarity === 'S' ? `<span class="one-owner">${owner ? `Possédée par ${esc(owner)}` : 'Encore à prendre !'}</span>` : '';
      return `<div class="grid-card ${n ? '' : 'missing'}" title="${esc(c.name)}">${cardHTML(c)}${n ? `<span class="qty">×${n}</span>` : ''}${tag}</div>`;
    }).join('') || '<p class="muted">Aucune carte.</p>';
  }
}
