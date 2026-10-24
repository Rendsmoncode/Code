// Onglets « Boosters » (ouverture) et « Collection ».
import { S, openBoosters, refreshStatus, refreshCollection, takeReveals, onChange } from './store.js';
import { RARITIES, RARITY_ORDER, TYPES, esc, cardHTML, showCardBig } from './cards.js';
import { logoSVG } from './logo.js';
import { hasVideo, preloadVideo, playCardVideo, stopCardVideo } from './video.js';
import { refreshAchievements } from './achievements.js';

const RATES = [
  ['3 cartes', 'Commune'],
  ['1 carte', 'Peu commune'],
  ['1 carte', 'Rare ou mieux : 1 Super rare (SR) tous les 4 boosters, 1 Ultra rare (UR) tous les 15, 1 Légendaire (LR) tous les 50'],
];

let busy = false;
let qty = 1; // nombre de boosters ouverts d'un coup (1 à 10, ou jusqu'à 100 boosters offerts)

// Au-delà de 10 boosters d'un coup, seuls les boosters offerts comptent (limite 100).
const maxQty = (b) => (S.status?.gifted > 10 ? Math.min(100, S.status.gifted) : Math.min(10, b?.total || 0));
const SPECIAL = { UR: 1100, L: 1700, S: 2600 }; // durée de l'animation d'arrivée (ms) des grosses raretés
const rank = (id) => RARITY_ORDER.indexOf(S.byId[id]?.rarity);
const SR = RARITY_ORDER.indexOf('SR');

// Paquet de booster (accueil et onglet Boosters). set : code du set (SB01 = set de base n° 1).
export function packHTML(cls = '', set = 'SB01', sub = 'Booster · 5 cartes') {
  return `<div class="bpack ${cls}" aria-hidden="true"><div class="bp-seal bp-top"></div>
    <div class="bp-body"><div class="bp-set">${set}</div><div class="bp-logo">${logoSVG()}</div><div class="bp-sub">${sub}</div></div>
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

let revealFn = null; // ouverture plein écran (définie par initBoosters)

// Cartes offertes en attente : écran « Cadeau ! », puis chaque carte différente se révèle comme dans un booster.
export async function checkGifts() {
  if (!revealFn || busy || document.querySelector('.bx')) return;
  const list = await takeReveals();
  if (!list.length) return;
  await refreshCollection().catch(() => {});
  const pulls = list.filter((g) => S.byId[g.id]).sort((x, y) => rank(x.id) - rank(y.id));
  if (!pulls.length) return;
  busy = true;
  const total = pulls.reduce((a, g) => a + (g.n || 1), 0);
  const ov = document.createElement('div');
  ov.className = 'bx gift';
  ov.innerHTML = `<div class="bx-gift"><p class="bx-gift-t">Cadeau !</p>
    <p class="bx-gift-s">Tu as reçu <b>${total} carte${total > 1 ? 's' : ''}</b> · ${pulls.length} différente${pulls.length > 1 ? 's' : ''}</p>
    <div class="bs-pack">${packHTML('', 'SB01', 'Cadeau')}</div>
    <button class="btn main" data-do="go">Ouvrir</button></div>`;
  document.body.append(ov);
  let opened = false;
  ov.addEventListener('click', async (e) => {
    if (opened || !e.target.closest('[data-do=go], .bs-pack')) return;
    opened = true;
    const pack = ov.querySelector('.bpack');
    pack.classList.add('tear');
    await wait(650);
    ov.remove();
    revealFn(pulls, false, true);
  });
}

// Ouvre un booster depuis un autre onglet (accueil).
export const openFromHome = () => { qty = 1; document.querySelector('#tab-boosters .bs-open')?.click(); };

export function initBoosters() {
  const el = document.getElementById('tab-boosters');
  el.innerHTML = `
  <div class="boosters">
    <section class="bs-head">
      <div class="bs-pack">${packHTML('g2')}${packHTML('g1')}${packHTML()}<span class="bs-x"></span></div>
      <div class="bs-count"></div>
      <p class="bs-detail"></p>
      <div class="bs-qty" role="group" aria-label="Nombre de boosters à ouvrir">
        <button class="btn" data-q="-1" aria-label="Un de moins">−</button><span></span><button class="btn" data-q="1" aria-label="Un de plus">+</button>
        <button class="btn bs-max" data-q="max">Max</button></div>
      <p class="bs-gift" hidden>Plus de 10 d'un coup : uniquement des boosters offerts</p>
      <button class="btn bs-open">Ouvrir</button>
      <p class="msg bs-msg" role="status"></p>
    </section>
    <details class="bs-rates"><summary>Contenu d'un booster</summary>
      <ul>${RATES.map(([n, r]) => `<li><b>${n}</b> : ${r}</li>`).join('')}</ul>
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
      const { pulls, error } = await openBoosters(qty);
      if (error) { q('.bs-msg').textContent = `Seulement ${pulls.length / 5} booster(s) ouvert(s) : ${error.message}`; q('.bs-msg').classList.add('err'); }
      // Le paquet se déchire, puis les cartes arrivent une par une, de la Commune à la 1on1 (tous boosters confondus).
      const pack = q('.bs-pack .bpack:not(.g1):not(.g2)');
      pack.classList.add('tear');
      await wait(650);
      pack.classList.remove('tear');
      reveal([...pulls].sort((x, y) => rank(x.id) - rank(y.id)), pulls.some((p) => p.god));
    } catch (e) {
      q('.bs-msg').textContent = e.message;
      q('.bs-msg').classList.add('err');
      busy = false;
    }
    renderHead();
  });

  el.querySelector('.bs-qty').addEventListener('click', (e) => {
    const d = e.target.closest('[data-q]')?.dataset.q;
    if (!d) return;
    const max = maxQty(boosterState());
    qty = d === 'max' ? max : qty + Number(d);
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
    const max = maxQty(b);
    qty = Math.max(1, Math.min(qty, max || 1));
    q('.bs-qty span').textContent = qty;
    q('[data-q="-1"]').disabled = qty <= 1;
    q('[data-q="1"]').disabled = qty >= max;
    q('.bs-max').disabled = qty >= max;
    q('.bs-gift').hidden = qty <= 10;
    q('.bs-qty').hidden = total < 2;
    q('.bs-pack').classList.toggle('multi', qty > 1);
    q('.bs-x').textContent = qty > 1 ? `×${qty}` : '';
    q('.bs-open').textContent = qty > 1 ? `Ouvrir ${qty} boosters` : 'Ouvrir';
    q('.bs-open').disabled = busy || total === 0;
  }

  revealFn = reveal;
  // Compte à rebours, cadeaux reçus pendant qu'on est sur le site.
  setInterval(() => { if (!document.hidden) checkGifts().catch(() => {}); }, 30000);

  // Ouverture plein écran : une carte à la fois, on touche la carte pour passer à la suivante.
  // gift : cartes offertes (chaque carte différente une fois, p.n = nombre d'exemplaires).
  function reveal(pulls, god = false, gift = false) {
    const ov = document.createElement('div');
    ov.className = 'bx';
    ov.innerHTML = `<div class="bx-fx"></div><div class="bx-stage"></div><div class="bx-info"></div><div class="bx-hint"></div>
      <div class="bx-skip">${!gift && pulls.length > 25 && pulls.some((p) => rank(p.id) >= SR) ? '<button class="btn ghost" data-do="sr">Passer aux SR et +</button>' : ''}
      ${pulls.length > 5 ? '<button class="btn ghost" data-do="all">Tout révéler</button>' : ''}</div>`;
    document.body.append(ov);
    const stage = ov.querySelector('.bx-stage');
    // seq : ordre des cartes à révéler (« Tout révéler » n'y laisse que les Légendaires et 1on1 restantes).
    let seq = pulls.map((_, k) => k);
    let pos = -1;
    let lock = false;
    let done = false;
    let held = false; // appui long en cours : le relâchement ne doit pas passer à la carte suivante

    async function next() {
      if (lock) return;
      lock = true;
      const old = stage.querySelector('.bx-card');
      if (old) { old.classList.add('out'); ov.querySelector('.bx-info').innerHTML = ''; await wait(260); old.remove(); }
      if (done) return; // « Tout révéler » pendant l'animation
      pos++;
      ov.className = 'bx';
      ov.querySelector('.bx-fx').innerHTML = '';
      if (pos >= seq.length) { summary(); return; }
      const p = pulls[seq[pos]];
      const c = S.byId[p.id];
      const r = c?.rarity;
      ov.querySelector('.bx-hint').textContent = `${seq[pos] + 1} / ${pulls.length}`;
      if (SPECIAL[r]) {
        // Animation d'arrivée propre à la rareté, puis la carte apparaît avec son effet.
        ov.classList.add(`fx-${r}`, 'intro');
        preloadVideo(c);
        ov.querySelector('.bx-fx').innerHTML = fxHTML(r);
        await wait(SPECIAL[r]);
        if (done) return;
        ov.classList.remove('intro');
      }
      stage.insertAdjacentHTML('beforeend', `<button class="bx-card in r-${r}" data-id="${esc(p.id)}" aria-label="Carte suivante (appui long : voir en grand)">${cardHTML(c)}</button>`);
      ov.querySelector('.bx-info').innerHTML = `<span class="rar-chip r-${r}">${RARITIES[r]?.label || ''}</span>${p.n > 1 ? `<span class="bx-new">×${p.n}</span>` : ''}${p.new ? '<span class="bx-new">Nouvelle !</span>' : ''}
        ${r === 'S' ? '<div class="bx-unique">Exemplaire unique</div>' : ''}`;
      if (hasVideo(c)) {
        // 1on1 avec vidéo : elle se lance aussitôt, les effets reviennent quand elle se fige
        lock = false;
        await playCardVideo(c, stage.querySelector('.bx-card:last-child'));
        return;
      }
      await wait(SPECIAL[r] ? 500 : 250);
      lock = false;
    }

    // Récapitulatif : les doublons sont regroupés (×2, ×3…), dans l'ordre des raretés.
    function summary() {
      if (!done) refreshAchievements(); // après les révélations, pour ne rien gâcher
      done = true;
      ov.className = `bx done${pulls.length > 5 ? ' many' : ''}`;
      ov.querySelector('.bx-fx').innerHTML = '';
      ov.querySelector('.bx-hint').textContent = '';
      ov.querySelector('.bx-info').innerHTML = '';
      ov.querySelector('.bx-skip')?.remove();
      const groups = [];
      for (const p of pulls) {
        const g = groups.find((x) => x.id === p.id);
        if (g) { g.n += p.n || 1; g.new ||= p.new; } else groups.push({ id: p.id, n: p.n || 1, new: p.new });
      }
      const left = gift ? 0 : boosterState()?.total || 0;
      const again = Math.min(10, left, Math.max(1, pulls.length / 5));
      stage.innerHTML = `<div class="bx-sum">${groups.map((g) => {
        const c = S.byId[g.id];
        return `<div class="bx-mini r-${c?.rarity}" data-id="${esc(g.id)}" role="button" tabindex="0" title="Voir en grand">${cardHTML(c)}<span class="rar-chip r-${c?.rarity}">${RARITIES[c?.rarity]?.short || ''}</span>
          ${g.new ? '<span class="bx-new">Nouvelle</span>' : ''}${g.n > 1 ? `<span class="bx-n">×${g.n}</span>` : ''}</div>`;
      }).join('')}</div>
      <div class="bx-acts">${left ? `<button class="btn main" data-do="again">${again > 1 ? `Ouvrir ${again} autres` : 'Ouvrir un autre'} · ${left}</button>` : ''}<button class="btn ghost" data-do="close">Terminer</button></div>`;
      lock = false;
    }

    // God Pack : annonce spéciale avant la première carte.
    async function start() {
      if (god) {
        lock = true;
        ov.classList.add('fx-S', 'fx-god', 'intro');
        ov.querySelector('.bx-fx').innerHTML = `${fxHTML('S')}<div class="fx-godtxt">GOD PACK</div>`;
        await wait(2800);
        lock = false;
      }
      next();
    }

    ov.addEventListener('click', (e) => {
      const d = e.target.closest('[data-do]')?.dataset.do;
      if (d === 'all') {
        // On saute tout, sauf les Légendaires et 1on1 pas encore révélées : elles gardent leur animation.
        seq = [...seq.slice(0, pos + 1), ...seq.slice(pos + 1).filter((k) => ['L', 'S'].includes(S.byId[pulls[k].id]?.rarity))];
        ov.querySelector('.bx-skip')?.remove();
        if (pos + 1 >= seq.length) summary();
        else if (!lock) next();
        return;
      }
      if (d === 'sr') {
        // Saute directement à la première SR (les cartes sont rangées de la Commune à la 1on1).
        const first = seq.findIndex((k) => rank(pulls[k].id) >= SR);
        if (lock) return;
        e.target.closest('[data-do]').remove();
        if (first > pos + 1) { pos = first - 1; stage.querySelector('.bx-card')?.remove(); next(); }
        return;
      }
      if (d === 'close' || d === 'again') {
        ov.remove();
        for (const ev of ['pointerup', 'pointercancel']) document.removeEventListener(ev, release);
        busy = false;
        renderHead();
        if (gift) checkGifts().catch(() => {});
        if (d === 'again') { qty = Math.max(1, Math.min(10, pulls.length / 5)); renderHead(); q('.bs-open').click(); }
        return;
      }
      // Récapitulatif : toucher une carte l'affiche en grand.
      const mini = e.target.closest('.bx-mini');
      if (mini) { showCardBig(S.byId[mini.dataset.id], { video: true }); return; }
      if (held) { held = false; return; }
      // un toucher pendant la vidéo l'arrête (fondu vers la carte) au lieu de passer à la suivante
      if (stage.querySelector('.vid-on')) { stopCardVideo(); return; }
      if (!ov.classList.contains('done')) next();
    });
    // Appui long sur la carte révélée : elle s'affiche en grand tant qu'on reste appuyé.
    let timer = null;
    let closeBig = null;
    ov.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.bx-card');
      held = false;
      if (!card) return;
      clearTimeout(timer);
      timer = setTimeout(() => { held = true; closeBig = showCardBig(S.byId[card.dataset.id], { hold: true }); }, 400);
    });
    // (sur le document : la vue en grand passe par-dessus et reçoit le relâchement)
    const release = () => { clearTimeout(timer); if (closeBig) { closeBig(); closeBig = null; } };
    for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, release);
    ov.addEventListener('contextmenu', (e) => { if (e.target.closest('.bx-card')) e.preventDefault(); });
    start();
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
  let filter = { rarity: '', type: '', q: '' };
  el.innerHTML = `
  <section class="panel">
    <div class="list-head"><h2>Ma collection</h2><div class="cl-progress muted"></div></div>
    <div class="cl-rarities"></div>
    <div class="filters">
      <input class="cl-q" type="search" placeholder="Rechercher…" aria-label="Rechercher">
      <select class="cl-rarity" aria-label="Rareté"><option value="">Toutes raretés</option>${Object.entries(RARITIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
      <select class="cl-type" aria-label="Type"><option value="">Tous types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    </div>
    <div class="card-grid cl-grid"></div>
  </section>`;
  const q = (s) => el.querySelector(s);
  q('.filters').addEventListener('input', () => {
    filter = { q: q('.cl-q').value.toLowerCase(), rarity: q('.cl-rarity').value, type: q('.cl-type').value };
    render();
  });
  q('.cl-grid').addEventListener('click', (e) => {
    const g = e.target.closest('.grid-card');
    if (lpDone) { lpDone = false; return; } // l'appui long a déjà ouvert la carte
    if (g) showCardBig(S.byId[g.dataset.id]);
  });
  // Appui long : la carte en grand, avec la vidéo pour une 1on1 qui en a une.
  let lpTimer = null;
  let lpDone = false;
  q('.cl-grid').addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.grid-card');
    lpDone = false;
    clearTimeout(lpTimer);
    if (g) lpTimer = setTimeout(() => { lpDone = true; showCardBig(S.byId[g.dataset.id], { video: true }); }, 450);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) q('.cl-grid').addEventListener(ev, () => clearTimeout(lpTimer));
  q('.cl-grid').addEventListener('contextmenu', (e) => { if (e.target.closest('.grid-card')) e.preventDefault(); });
  q('.cl-grid').addEventListener('keydown', (e) => {
    const g = e.target.closest('.grid-card');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showCardBig(S.byId[g.dataset.id]); }
  });
  onChange(render);
  render();

  function render() {
    // Une 1on1 reste invisible tant que personne ne l'a tirée (même pour les admins, hors éditeur).
    const cards = S.cards.filter((c) => c.rarity !== 'S' || S.oneOfOne[c.id]);
    const owned = cards.filter((c) => S.collection[c.id]);
    q('.cl-progress').textContent = `${owned.length} / ${cards.length} cartes différentes`;
    q('.cl-rarity option[value=S]').hidden = !cards.some((c) => c.rarity === 'S');
    q('.cl-rarities').innerHTML = RARITY_ORDER.map((r) => {
      const all = cards.filter((c) => c.rarity === r).length;
      const have = owned.filter((c) => c.rarity === r).length;
      return all ? `<span class="rar-chip r-${r}">${RARITIES[r].label} ${have}/${all}</span>` : '';
    }).join('');
    // Seules les cartes possédées sont montrées (les manquantes ne comptent que dans les chiffres).
    const list = owned.filter((c) => (!filter.rarity || c.rarity === filter.rarity)
      && (!filter.type || c.type === filter.type)
      && (!filter.q || `${c.name} ${c.code} ${c.traits} ${c.effect}`.toLowerCase().includes(filter.q)))
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
    q('.cl-grid').innerHTML = list.map((c) => {
      const n = S.collection[c.id] || 0;
      const owner = c.rarity === 'S' ? S.oneOfOne[c.id] : null;
      const tag = owner ? `<span class="one-owner">Possédée par ${esc(owner)}</span>` : '';
      return `<div class="grid-card" data-id="${esc(c.id)}" role="button" tabindex="0" title="${esc(c.name)} : voir en grand">${cardHTML(c)}${n > 1 ? `<span class="qty">×${n}</span>` : ''}${tag}</div>`;
    }).join('') || `<p class="muted">${owned.length ? 'Aucune carte ne correspond.' : 'Aucune carte pour l\'instant : ouvrez des boosters !'}</p>`;
  }
}
