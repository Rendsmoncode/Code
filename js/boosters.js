// Onglets « Boosters » (ouverture) et « Collection ».
import { S, openBooster, refreshStatus, onChange } from './store.js';
import { RARITIES, RARITY_ORDER, TYPES, esc, cardHTML } from './cards.js';

const RATES = [
  ['3 cartes', 'Commune'],
  ['1 carte', 'Peu commune'],
  ['1 carte', 'Rare ou mieux : 1 Super rare (SR) tous les 4 boosters, 1 Ultra rare (UR) tous les 15, 1 Légendaire (LR) tous les 50, 1 « 1on1 » tous les 2 000'],
];

let opening = null; // { pulls, flipped: Set }
let busy = false;

export function initBoosters() {
  const el = document.getElementById('tab-boosters');
  el.innerHTML = `
  <div class="boosters">
    <section class="panel bs-head">
      <div class="bs-stock"><div class="pack" aria-hidden="true"><span>BOOSTER</span></div>
        <div><div class="bs-count"></div><div class="bs-detail muted"></div></div></div>
      <button class="btn primary big bs-open">Ouvrir un booster</button>
      <p class="msg bs-msg" role="status"></p>
    </section>
    <section class="bs-stage"></section>
    <details class="panel small bs-rates"><summary>Contenu d'un booster</summary>
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
    q('.bs-open').disabled = true;
    try {
      const pulls = await openBooster();
      opening = { pulls, flipped: new Set() };
      renderStage();
    } catch (e) {
      q('.bs-msg').textContent = e.message;
      q('.bs-msg').classList.add('err');
    }
    busy = false;
    renderHead();
  });

  q('.bs-stage').addEventListener('click', (e) => {
    if (e.target.closest('[data-do=all]')) { opening.pulls.forEach((_, i) => opening.flipped.add(i)); renderStage(); return; }
    const i = e.target.closest('[data-i]')?.dataset.i;
    if (i !== undefined && opening) { opening.flipped.add(+i); renderStage(); }
  });

  // Compte à rebours et rafraîchissement régulier (pour voir arriver les boosters offerts).
  setInterval(renderHead, 1000);
  setInterval(() => { if (!document.hidden) refreshStatus().catch(() => {}); }, 30000);
  onChange(renderHead);
  renderHead();
  renderStage();

  function renderHead() {
    const st = S.status;
    if (!st) return;
    const now = Date.now() + (st.offset || 0);
    let { free } = st;
    let next = st.next_free_at ? new Date(st.next_free_at).getTime() : null;
    // Quand le compte à rebours arrive à zéro, on recalcule localement puis on resynchronise.
    while (next && next <= now && free < st.free_max) {
      free++;
      next = free < st.free_max ? next + 600000 : null;
      if (!st.syncing) { st.syncing = true; setTimeout(() => refreshStatus().catch(() => {}), 1500); }
    }
    const total = free + st.gifted;
    q('.bs-count').innerHTML = `<b>${total}</b> booster${total > 1 ? 's' : ''} disponible${total > 1 ? 's' : ''}`;
    const left = next ? Math.max(0, Math.ceil((next - now) / 1000)) : 0;
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    q('.bs-detail').innerHTML = `Gratuits : ${free}/${st.free_max} ${next ? `· prochain dans <b>${mm}:${ss}</b>` : '· réserve pleine'}
      · Offerts : <b>${st.gifted}</b>`;
    q('.bs-open').disabled = busy || total === 0;
  }

  function renderStage() {
    const stage = q('.bs-stage');
    if (!opening) { stage.innerHTML = ''; return; }
    const allOpen = opening.flipped.size === opening.pulls.length;
    stage.innerHTML = `
      <div class="pulls">${opening.pulls.map((p, i) => {
        const c = S.byId[p.id];
        const on = opening.flipped.has(i);
        return `<button class="pull ${on ? 'flipped' : ''} r-${c?.rarity}" data-i="${i}" aria-label="${on ? esc(c?.name) : 'Retourner la carte'}">
          <div class="pull-in">
            <div class="pull-back">${cardHTML(null)}</div>
            <div class="pull-front">${cardHTML(c)}
              <span class="rar-label r-${c?.rarity}">${RARITIES[c?.rarity]?.label || ''}</span>
              ${p.new ? '<span class="new">Nouvelle !</span>' : ''}</div>
          </div></button>`;
      }).join('')}</div>
      <div class="row-btns center-btns">${allOpen ? '' : '<button class="btn" data-do="all">Tout révéler</button>'}</div>`;
  }
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
