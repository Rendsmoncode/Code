// Constructeur de decks : 1 Leader + 50 cartes.
// Utilisé pour les decks des joueurs (onglet Decks, cartes possédées uniquement)
// et pour les decks préconstruits (onglet Admin, toutes les cartes).
import { S, saveDeck, deleteDeck, validateDeck, onChange } from './store.js';
import { COLORS, TYPES, RARITIES, esc, uid, cardHTML, download } from './cards.js';

// opts : { el, kind: 'decks' | 'starter_decks', owned: bool, title, intro }
export function createDeckBuilder(opts) {
  const { kind, owned } = opts;
  const root = () => opts.el;
  const decks = () => (kind === 'starter_decks' ? S.starters : S.decks);
  let curId = null;
  let filter = { q: '', type: '', rarity: '' };
  const cur = () => decks().find((d) => d.id === curId);

  root().innerHTML = `
  <div class="decks">
    <aside class="panel deck-side">
      <h2>${esc(opts.title)}</h2>
      <div class="dk-list deck-list"></div>
      <div class="row-btns"><button class="btn primary dk-new">Nouveau deck</button></div>
      ${opts.intro ? `<p class="muted small">${opts.intro}</p>` : ''}
      <p class="msg dk-msg" role="status"></p>
    </aside>
    <section class="panel deck-main dk-main"></section>
  </div>`;
  const r = root();
  const q = (s) => r.querySelector(s);
  const msg = (t, err = true) => { q('.dk-msg').textContent = t; q('.dk-msg').classList.toggle('err', err); };
  const save = async (d) => {
    try { await saveDeck(d, kind); msg(''); } catch (e) { msg(e.message); render(); }
  };

  q('.dk-new').addEventListener('click', () => {
    const d = { id: uid(), name: `Deck ${decks().length + 1}`, leader: null, cards: {} };
    curId = d.id;
    save(d);
  });
  q('.dk-list').addEventListener('click', (e) => {
    const id = e.target.closest('[data-deck]')?.dataset.deck;
    if (id) { curId = id; render(); }
  });
  q('.dk-main').addEventListener('click', onMainClick);
  q('.dk-main').addEventListener('input', onMainInput);
  onChange(render);
  render();

  async function onMainClick(e) {
    const d = cur();
    const t = e.target.closest('[data-act]');
    if (!d || !t) return;
    const { act, id } = t.dataset;
    if (act === 'add') {
      const c = S.byId[id];
      const max = Math.min(4, owned ? S.collection[id] || 0 : 4);
      if (c.type === 'leader') d.leader = id;
      else if ((d.cards[id] || 0) >= max) return msg(owned && max < 4 ? `Vous ne possédez que ${max} exemplaire(s) de « ${c.name} ».` : '4 exemplaires maximum.');
      else d.cards[id] = (d.cards[id] || 0) + 1;
    } else if (act === 'rm') {
      d.cards[id] = (d.cards[id] || 0) - 1;
      if (d.cards[id] <= 0) delete d.cards[id];
    } else if (act === 'unleader') {
      d.leader = null;
    } else if (act === 'export') {
      download(`${d.name.replace(/[^\w-]+/g, '_') || 'deck'}.json`, { format: 'optcg-maison-deck', deck: d });
      return;
    } else if (act === 'delete') {
      if (!confirm(`Supprimer le deck « ${d.name} » ?`)) return;
      curId = null;
      try { await deleteDeck(d.id, kind); } catch (err) { msg(err.message); }
      return;
    } else return;
    save(d);
  }

  let nameTimer;
  function onMainInput(e) {
    const d = cur();
    if (e.target.classList.contains('dk-name') && d) {
      d.name = e.target.value;
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => save(d), 500);
    }
    if (e.target.closest('.filters')) {
      filter = { q: q('.dk-q').value.toLowerCase(), type: q('.dk-ftype').value, rarity: q('.dk-frarity').value };
      renderPool();
    }
  }

  function render() {
    q('.dk-list').innerHTML = decks().length ? decks().map((d) => {
      const v = validateDeck(d, { owned });
      const l = S.byId[d.leader];
      return `<button class="deck-item${d.id === curId ? ' on' : ''}" data-deck="${d.id}">
        <span class="dot" style="--bg:${l ? COLORS[l.colors[0]]?.hex : '#666'}"></span>
        <span class="dn">${esc(d.name)}</span>
        <span class="badge ${v.ok ? 'ok' : 'ko'}">${v.total}/50</span></button>`;
    }).join('') : '<p class="muted">Aucun deck.</p>';

    const main = q('.dk-main');
    const d = cur();
    if (!d) {
      delete main.dataset.deck;
      main.innerHTML = '<p class="muted">Créez ou sélectionnez un deck.</p>';
      return;
    }
    // Le champ du nom n'est recréé qu'en changeant de deck, pour garder le focus pendant la frappe.
    if (main.dataset.deck !== d.id) {
      main.dataset.deck = d.id;
      main.innerHTML = `
        <div class="list-head">
          <input class="title-input dk-name" maxlength="40" aria-label="Nom du deck">
          <div class="row-btns">
            <button class="btn ghost" data-act="export">Exporter</button>
            <button class="btn danger" data-act="delete">Supprimer</button>
          </div>
        </div>
        <div class="dk-status"></div>
        <div class="deck-build">
          <div>
            <h3>Leader</h3><div class="dk-leader"></div>
            <h3>Contenu <span class="muted small">(cliquer pour retirer 1)</span></h3>
            <div class="dk-content deck-content"></div>
          </div>
          <div>
            <h3>${owned ? 'Mes cartes' : 'Toutes les cartes'} <span class="muted small">(cliquer pour ajouter 1)</span></h3>
            <div class="filters">
              <input class="dk-q" type="search" placeholder="Rechercher…" aria-label="Rechercher">
              <select class="dk-ftype" aria-label="Type"><option value="">Tous types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
              <select class="dk-frarity" aria-label="Rareté"><option value="">Toutes raretés</option>${Object.entries(RARITIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
            </div>
            <div class="dk-pool card-grid small"></div>
          </div>
        </div>`;
      main.querySelector('.dk-name').value = d.name;
    }
    const v = validateDeck(d, { owned });
    main.querySelector('.dk-status').innerHTML = `
      <div class="deck-count ${v.ok ? 'ok' : ''}"><b>${v.total}</b> / 50 cartes ${v.ok ? '· Deck valide ✓' : ''}</div>
      ${v.ok ? '' : `<ul class="errs">${v.errs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`}`;
    const l = S.byId[d.leader];
    main.querySelector('.dk-leader').innerHTML = l
      ? `<button class="grid-card" data-act="unleader" title="Retirer le Leader">${cardHTML(l)}</button>`
      : '<p class="muted small">Cliquez sur un Leader dans la liste de droite.</p>';
    const entries = Object.entries(d.cards).filter(([id]) => S.byId[id])
      .sort(([a], [b]) => (S.byId[a].cost - S.byId[b].cost) || S.byId[a].name.localeCompare(S.byId[b].name));
    main.querySelector('.dk-content').innerHTML = entries.length ? entries.map(([id, n]) =>
      `<button class="grid-card" data-act="rm" data-id="${id}">${cardHTML(S.byId[id])}<span class="qty">×${n}</span></button>`).join('')
      : '<p class="muted small">Vide.</p>';
    renderPool();
  }

  function renderPool() {
    const d = cur();
    const pool = q('.dk-pool');
    if (!d || !pool) return;
    const leader = S.byId[d.leader];
    const list = S.cards.filter((c) => (!owned || S.collection[c.id])
      && (!filter.type || c.type === filter.type)
      && (!filter.rarity || c.rarity === filter.rarity)
      && (!filter.q || `${c.name} ${c.code} ${c.traits} ${c.effect}`.toLowerCase().includes(filter.q))
      && (c.type === 'leader' || !leader || c.colors.some((x) => leader.colors.includes(x))));
    pool.innerHTML = list.length ? list.map((c) => {
      const have = owned ? S.collection[c.id] || 0 : null;
      const used = c.type === 'leader' ? (d.leader === c.id ? 1 : 0) : d.cards[c.id] || 0;
      return `<button class="grid-card" data-act="add" data-id="${c.id}">${cardHTML(c)}
        ${used || have ? `<span class="qty">${used}${have !== null ? `/${have}` : ''}</span>` : ''}</button>`;
    }).join('')
      : `<p class="muted small">${owned ? 'Aucune carte : ouvrez des boosters !' : 'Aucune carte.'}</p>`;
  }
}
