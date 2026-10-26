// Onglet « Game Master » (propriétaire uniquement) : cartes et boosters de n'importe quel joueur,
// remise à zéro d'une collection avec sauvegarde, et restitution des sauvegardes à tout moment.
import {
  S, listPlayers, giveBoosters, refreshCollection, gmCollection, gmAddCard, gmResetCollection, gmRestoreBackup, gmBackups,
} from './store.js';
import { RARITIES, RARITY_ORDER, esc, cardHTML } from './cards.js';
import { mountSurprise } from './gm-surprise.js';
import { mountLive } from './gm-live.js';

export function initGM() {
  const el = document.getElementById('tab-gm');
  el.innerHTML = `
  <div class="gm">
    <div class="ach-head"><h2>Game Master</h2></div>
    <section class="panel gm-live"></section>
    <section class="panel gm-surprise"></section>
    <section class="panel gm-who">
      <label>Joueur <select class="gm-player" aria-label="Joueur"></select></label>
      <span class="gm-sum muted"></span>
      <div class="gm-boost row-btns"><input class="gm-n" type="number" min="1" max="10000" value="10" aria-label="Boosters">
        <button class="btn" data-do="boost">Donner des boosters</button></div>
    </section>
    <section class="panel gm-deck row-btns">
      <label>Deck <select class="gm-decksel" aria-label="Deck"></select></label>
      <button class="btn" data-do="deck">Donner toutes les cartes de ce deck au joueur</button>
    </section>
    <p class="msg gm-msg" role="status"></p>
    <section class="panel">
      <h3>Cartes</h3>
      <div class="filters">
        <input class="gm-q" type="search" placeholder="Chercher une carte (nom, type, code)…" aria-label="Chercher une carte">
        <select class="gm-own" aria-label="Filtre"><option value="">Toutes les cartes</option><option value="yes" selected>Possédées par ce joueur</option><option value="no">Non possédées</option></select>
        <select class="gm-rar" aria-label="Rareté"><option value="">Toutes raretés</option>${RARITY_ORDER.map((r) => `<option value="${r}">${RARITIES[r].label}</option>`).join('')}</select>
      </div>
      <div class="gm-list"></div>
    </section>
    <section class="panel">
      <h3>Remise à zéro</h3>
      <p class="muted small">La collection est sauvegardée avant d'être vidée : tu pourras la rendre à tout moment ci-dessous.</p>
      <button class="btn danger" data-do="reset">Réinitialiser la collection de ce joueur</button>
      <h3>Collections sauvegardées</h3>
      <div class="gm-backups"></div>
    </section>
  </div>`;
  const q = (s) => el.querySelector(s);
  mountLive(q('.gm-live'));
  mountSurprise(q('.gm-surprise'));
  let player = '';
  let coll = {};
  let loaded = false;

  const msg = (t, err = false) => { q('.gm-msg').textContent = t; q('.gm-msg').classList.toggle('err', err); };

  async function loadPlayers() {
    const players = await listPlayers();
    q('.gm-player').innerHTML = players.map((p) => `<option value="${esc(p.username)}">${esc(p.username)}${p.username === S.status.username ? ' (moi)' : ''} · ${p.boosters} boosters offerts</option>`).join('');
    if (player) q('.gm-player').value = player;
    player = q('.gm-player').value;
  }

  function loadDecks() {
    q('.gm-decksel').innerHTML = S.decks.length ? S.decks.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')
      : '<option value="">Aucun deck (créez ou importez-en un dans l\'onglet Decks)</option>';
  }

  async function loadColl() {
    coll = player ? await gmCollection(player) : {};
    renderList();
  }

  function renderList() {
    const f = { q: q('.gm-q').value.toLowerCase(), own: q('.gm-own').value, rar: q('.gm-rar').value };
    const kinds = Object.keys(coll).length;
    const total = Object.values(coll).reduce((a, b) => a + b, 0);
    q('.gm-sum').textContent = `${kinds} cartes différentes · ${total} exemplaires`;
    const list = S.cards.filter((c) => (!f.rar || c.rarity === f.rar)
      && (f.own !== 'yes' || coll[c.id]) && (f.own !== 'no' || !coll[c.id])
      && (!f.q || `${c.name} ${c.traits} ${c.code}`.toLowerCase().includes(f.q)))
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name))
      .slice(0, 200);
    q('.gm-list').innerHTML = list.map((c) => {
      const n = coll[c.id] || 0;
      const owner = c.rarity === 'S' ? S.oneOfOne[c.id] : null;
      return `<div class="gm-row ${n ? '' : 'none'}" data-id="${esc(c.id)}">
        <div class="gm-mini">${cardHTML(c, { cls: 'mini' })}</div>
        <div class="gm-name"><b>${esc(c.name)}</b><small><span class="rar-chip r-${c.rarity}">${RARITIES[c.rarity]?.short}</span>${esc(c.traits || '')}${owner && owner !== player ? ` · 1on1 possédée par ${esc(owner)}` : ''}</small></div>
        <div class="gm-qty"><button class="btn small" data-d="-1" ${n ? '' : 'disabled'} aria-label="Retirer 1">−</button><b>${n}</b><button class="btn small" data-d="1" aria-label="Donner 1">+</button>
          ${n ? `<button class="btn small ghost" data-d="${-n}" title="Retirer tous les exemplaires">Tout retirer</button>` : ''}</div></div>`;
    }).join('') || '<p class="muted">Aucune carte.</p>';
  }

  async function renderBackups() {
    const list = await gmBackups();
    q('.gm-backups').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Joueur</th><th>Cartes</th><th>État</th><th></th></tr></thead><tbody>
      ${list.map((b) => `<tr><td>${new Date(b.created_at).toLocaleString('fr-FR')}</td><td>${esc(b.username)}</td><td>${b.nb} différentes · ${b.total} ex.</td>
        <td>${b.restored_at ? `Rendue le ${new Date(b.restored_at).toLocaleString('fr-FR')}` : 'En attente'}</td>
        <td><button class="btn small" data-restore="${b.id}">${b.restored_at ? 'Rendre à nouveau' : 'Rendre'}</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">Aucune sauvegarde pour l\'instant.</p>';
  }

  // Après une modification de ma propre collection, on met aussi à jour le reste du site.
  const sync = async () => { if (player === S.status.username) await refreshCollection(); };

  async function run(fn) {
    try { await fn(); } catch (e) { msg(e.message, true); }
  }

  q('.gm-player').addEventListener('change', () => run(async () => { player = q('.gm-player').value; msg(''); await loadColl(); }));
  q('.filters').addEventListener('input', renderList);
  el.addEventListener('click', (e) => run(async () => {
    const d = e.target.closest('[data-d]');
    if (d) {
      const id = d.closest('[data-id]').dataset.id;
      const c = S.byId[id];
      if (+d.dataset.d > 0 && c?.rarity === 'S' && S.oneOfOne[id] && S.oneOfOne[id] !== player
        && !confirm(`« ${c.name} » est une 1on1 déjà possédée par ${S.oneOfOne[id]}. La donner quand même ?`)) return;
      const n = await gmAddCard(player, id, +d.dataset.d);
      if (n) coll[id] = n; else delete coll[id];
      msg(`${c?.name} : ${player} en a maintenant ${n}.`);
      renderList();
      await sync();
      return;
    }
    const act = e.target.closest('[data-do]')?.dataset.do;
    if (act === 'boost') {
      const n = Math.max(1, Number(q('.gm-n').value) || 0);
      await giveBoosters(player, n);
      msg(`${n} booster${n > 1 ? 's' : ''} donné${n > 1 ? 's' : ''} à ${player}.`);
      await loadPlayers();
    }
    if (act === 'deck') {
      // Donne seulement ce qui manque au joueur pour avoir le deck complet (Leader compris).
      const d = S.decks.find((x) => x.id === q('.gm-decksel').value);
      if (!d) { msg('Choisissez un deck.', true); return; }
      const need = { ...(d.cards || {}) };
      if (d.leader) need[d.leader] = Math.max(need[d.leader] || 0, 1);
      let given = 0;
      for (const [id, n] of Object.entries(need)) {
        const miss = n - (coll[id] || 0);
        if (miss > 0 && S.byId[id]) { coll[id] = await gmAddCard(player, id, miss); given += miss; }
      }
      msg(given ? `${given} carte(s) donnée(s) à ${player} : le deck « ${d.name} » est complet.` : `${player} a déjà toutes les cartes de « ${d.name} ».`);
      renderList(); await sync();
    }
    if (act === 'reset') {
      if (!confirm(`Vider toute la collection de ${player} ? Elle sera sauvegardée et tu pourras la rendre à tout moment.`)) return;
      await gmResetCollection(player);
      msg(`Collection de ${player} remise à zéro (sauvegardée).`);
      await loadColl(); await renderBackups(); await sync();
    }
    const r = e.target.closest('[data-restore]');
    if (r) {
      const n = await gmRestoreBackup(+r.dataset.restore);
      msg(`Collection rendue : ${n} cartes différentes ajoutées.`);
      await loadColl(); await renderBackups(); await sync();
    }
  }));

  // Chargement à la première ouverture de l'onglet (évite des requêtes inutiles au démarrage).
  new MutationObserver(() => {
    if (!el.hidden) loadDecks();
    if (!el.hidden && !loaded) { loaded = true; run(async () => { await loadPlayers(); await loadColl(); await renderBackups(); }); }
  }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
}
