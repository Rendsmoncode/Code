// Onglet « Decks » : 1 Leader + 50 cartes.
import { S, saveDeck, deleteDeck, saveCards, validateDeck, onChange } from './store.js';
import { COLORS, TYPES, esc, uid, cardHTML, download, readJSONFile } from './cards.js';

const root = () => document.getElementById('tab-decks');
let curId = null;
let filter = { q: '', type: '' };

const cur = () => S.decks.find((d) => d.id === curId);

export function initDecks() {
  root().innerHTML = `
  <div class="decks">
    <aside class="panel deck-side">
      <h2>Mes decks</h2>
      <div id="dk-list" class="deck-list"></div>
      <div class="row-btns">
        <button class="btn primary" id="dk-new">Nouveau deck</button>
        <label class="btn ghost"><input type="file" id="dk-import" accept=".json,application/json" hidden>Importer un deck</label>
      </div>
      <p class="muted small">Un deck exporté contient aussi ses cartes : votre ami peut l'importer directement.</p>
    </aside>
    <section class="panel deck-main" id="dk-main"></section>
  </div>`;
  const r = root();
  r.querySelector('#dk-new').addEventListener('click', async () => {
    const d = { id: uid(), name: `Deck ${S.decks.length + 1}`, leader: '', cards: {} };
    curId = d.id;
    await saveDeck(d);
  });
  r.querySelector('#dk-list').addEventListener('click', (e) => {
    const id = e.target.closest('[data-deck]')?.dataset.deck;
    if (id) { curId = id; render(); }
  });
  r.querySelector('#dk-import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = await readJSONFile(f);
      if (!data.deck) throw new Error('pas un deck');
      if (data.cards?.length) await saveCards(data.cards);
      const d = { ...data.deck, id: uid() };
      curId = d.id;
      await saveDeck(d);
    } catch { alert('Fichier de deck invalide.'); }
  });
  r.querySelector('#dk-main').addEventListener('click', onMainClick);
  r.querySelector('#dk-main').addEventListener('input', onMainInput);
  onChange(render);
  render();
}

async function onMainClick(e) {
  const d = cur();
  if (!d) return;
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const { act, id } = t.dataset;
  if (act === 'add') {
    const c = S.byId[id];
    if (c.type === 'leader') d.leader = id;
    else d.cards[id] = Math.min(4, (d.cards[id] || 0) + 1);
  } else if (act === 'rm') {
    d.cards[id] = (d.cards[id] || 0) - 1;
    if (d.cards[id] <= 0) delete d.cards[id];
  } else if (act === 'unleader') {
    d.leader = '';
  } else if (act === 'export') {
    const ids = [d.leader, ...Object.keys(d.cards)].filter((x) => S.byId[x]);
    download(`${d.name.replace(/[^\w-]+/g, '_') || 'deck'}.json`,
      { format: 'optcg-maison-deck', deck: d, cards: ids.map((x) => S.byId[x]) });
    return;
  } else if (act === 'delete') {
    if (!confirm(`Supprimer le deck « ${d.name} » ?`)) return;
    curId = null;
    await deleteDeck(d.id);
    return;
  } else return;
  await saveDeck(d);
}

let nameTimer;
function onMainInput(e) {
  const d = cur();
  if (e.target.id === 'dk-name' && d) {
    d.name = e.target.value;
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => saveDeck(d), 400);
  }
  if (e.target.closest('.filters')) {
    const r = root();
    filter = { q: r.querySelector('#dk-q').value.toLowerCase(), type: r.querySelector('#dk-ftype').value };
    renderPool();
  }
}

function render() {
  const r = root();
  r.querySelector('#dk-list').innerHTML = S.decks.length ? S.decks.map((d) => {
    const v = validateDeck(d);
    const l = S.byId[d.leader];
    return `<button class="deck-item${d.id === curId ? ' on' : ''}" data-deck="${d.id}">
      <span class="dot" style="--bg:${l ? COLORS[l.colors[0]]?.hex : '#666'}"></span>
      <span class="dn">${esc(d.name)}</span>
      <span class="badge ${v.ok ? 'ok' : 'ko'}">${v.total}/50</span></button>`;
  }).join('') : '<p class="muted">Aucun deck.</p>';

  const main = r.querySelector('#dk-main');
  const d = cur();
  if (!d) {
    main.innerHTML = `<p class="muted">Créez ou sélectionnez un deck. ${S.cards.length ? '' : 'Commencez par créer des cartes dans l\'onglet <b>Cartes</b> (au moins un Leader).'}</p>`;
    return;
  }
  // Ne recréer le champ nom que si nécessaire (garde le focus pendant la frappe).
  if (main.dataset.deck !== d.id) {
    main.dataset.deck = d.id;
    main.innerHTML = `
      <div class="list-head">
        <input id="dk-name" class="title-input" maxlength="40" aria-label="Nom du deck">
        <div class="row-btns">
          <button class="btn ghost" data-act="export">Exporter</button>
          <button class="btn danger" data-act="delete">Supprimer</button>
        </div>
      </div>
      <div id="dk-status"></div>
      <div class="deck-build">
        <div>
          <h3>Leader</h3><div id="dk-leader"></div>
          <h3>Contenu <span class="muted small">(cliquer pour retirer 1)</span></h3>
          <div id="dk-content" class="deck-content"></div>
        </div>
        <div>
          <h3>Ajouter des cartes <span class="muted small">(cliquer pour ajouter 1)</span></h3>
          <div class="filters">
            <input id="dk-q" type="search" placeholder="Rechercher…">
            <select id="dk-ftype"><option value="">Tous types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          </div>
          <div id="dk-pool" class="card-grid small"></div>
        </div>
      </div>`;
    main.querySelector('#dk-name').value = d.name;
  }
  const v = validateDeck(d);
  main.querySelector('#dk-status').innerHTML = `
    <div class="deck-count ${v.ok ? 'ok' : ''}"><b>${v.total}</b> / 50 cartes ${v.ok ? '· Deck valide ✓' : ''}</div>
    ${v.ok ? '' : `<ul class="errs">${v.errs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`}`;
  const l = S.byId[d.leader];
  main.querySelector('#dk-leader').innerHTML = l
    ? `<button class="grid-card" data-act="unleader" title="Retirer le Leader">${cardHTML(l)}</button>`
    : '<p class="muted small">Cliquez sur un Leader dans la liste de droite.</p>';
  const entries = Object.entries(d.cards).filter(([id]) => S.byId[id])
    .sort(([a], [b]) => (S.byId[a].cost - S.byId[b].cost) || S.byId[a].name.localeCompare(S.byId[b].name));
  main.querySelector('#dk-content').innerHTML = entries.length ? entries.map(([id, n]) =>
    `<button class="grid-card" data-act="rm" data-id="${id}">${cardHTML(S.byId[id])}<span class="qty">×${n}</span></button>`).join('')
    : '<p class="muted small">Vide.</p>';
  renderPool();
}

function renderPool() {
  const d = cur();
  const pool = root().querySelector('#dk-pool');
  if (!d || !pool) return;
  const leader = S.byId[d.leader];
  const list = S.cards.filter((c) => (!filter.type || c.type === filter.type)
    && (!filter.q || `${c.name} ${c.code} ${c.traits} ${c.effect}`.toLowerCase().includes(filter.q))
    && (c.type === 'leader' || !leader || c.colors.some((x) => leader.colors.includes(x))));
  pool.innerHTML = list.length ? list.map((c) =>
    `<button class="grid-card" data-act="add" data-id="${c.id}">${cardHTML(c)}${d.cards[c.id] ? `<span class="qty">×${d.cards[c.id]}</span>` : ''}</button>`).join('')
    : '<p class="muted small">Aucune carte disponible.</p>';
}
