// Onglet « Admin » : invitations, distribution de boosters, rôles et decks préconstruits.
import {
  S, isOwner, listPlayers, giveBoosters, setRole, validateDeck, onChange,
  listInvites, createInvite, deleteInvite, inviteLink,
} from './store.js';
import { esc } from './cards.js';
import { createDeckBuilder } from './decks.js';

const ROLE = { owner: 'Propriétaire', admin: 'Admin', player: 'Joueur' };

export function initAdmin() {
  const el = document.getElementById('tab-admin');
  el.innerHTML = `
  <div class="admin">
    <section class="panel">
      <h2>Invitations</h2>
      <p class="muted small">Chaque ami reçoit son propre lien, valable une seule fois : son pseudo est réservé, son deck et ses boosters l'attendent.</p>
      <form class="iv-form row-btns" autocomplete="off">
        <input class="iv-name" maxlength="20" placeholder="Pseudo de l'ami" aria-label="Pseudo">
        <select class="iv-starter" aria-label="Deck de départ"></select>
        <label class="small">Boosters <input class="iv-n" type="number" min="0" max="10000" value="10"></label>
        <button class="btn primary">Créer le lien</button>
      </form>
      <p class="msg iv-msg" role="status"></p>
      <div class="iv-new"></div>
      <div class="iv-list"></div>
    </section>
    <section class="panel">
      <h2>Distribuer des boosters</h2>
      <form class="ad-give row-btns" autocomplete="off">
        <select class="ad-target" aria-label="Joueur"></select>
        <input class="ad-n" type="number" min="1" max="10000" value="10" aria-label="Nombre de boosters">
        <button class="btn primary">Donner</button>
      </form>
      <p class="msg ad-msg" role="status"></p>
      <h3>Joueurs</h3>
      <div class="ad-players"></div>
    </section>
    <div class="ad-starters"></div>
  </div>`;
  const q = (s) => el.querySelector(s);
  const msg = (t, err = false) => { q('.ad-msg').textContent = t; q('.ad-msg').classList.toggle('err', err); };
  let players = [];

  async function refresh() {
    try {
      players = await listPlayers();
    } catch (e) { msg(e.message, true); return; }
    const keep = q('.ad-target').value;
    q('.ad-target').innerHTML = `<option value="*">Tous les joueurs (${players.length})</option>`
      + players.map((p) => `<option value="${esc(p.username)}">${esc(p.username)}${p.username === S.status.username ? ' (moi)' : ''}</option>`).join('');
    if (keep) q('.ad-target').value = keep;
    q('.ad-players').innerHTML = `<table class="tbl"><thead><tr><th>Pseudo</th><th>Rôle</th><th>Boosters offerts en réserve</th>${isOwner() ? '<th></th>' : ''}</tr></thead><tbody>
      ${players.map((p) => `<tr><td>${esc(p.username)}</td><td>${ROLE[p.role]}</td><td>${p.boosters}</td>
        ${isOwner() ? `<td>${p.role === 'player' ? `<button class="btn small" data-role="admin" data-u="${esc(p.username)}">Nommer admin</button>`
          : p.role === 'admin' ? `<button class="btn small ghost" data-role="player" data-u="${esc(p.username)}">Retirer admin</button>` : ''}</td>` : ''}</tr>`).join('')}
      </tbody></table>`;
  }

  q('.ad-give').addEventListener('submit', async (e) => {
    e.preventDefault();
    const target = q('.ad-target').value;
    const n = +q('.ad-n').value;
    try {
      const count = await giveBoosters(target === '*' ? null : target, n);
      msg(`${n} booster${n > 1 ? 's' : ''} donné${n > 1 ? 's' : ''} à ${target === '*' ? `${count} joueur${count > 1 ? 's' : ''}` : target}.`);
      refresh();
    } catch (err) { msg(err.message, true); }
  });

  q('.ad-players').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-role]');
    if (!b) return;
    try {
      await setRole(b.dataset.u, b.dataset.role);
      msg(`${b.dataset.u} est maintenant ${ROLE[b.dataset.role].toLowerCase()}.`);
      refresh();
    } catch (err) { msg(err.message, true); }
  });

  createDeckBuilder({
    el: q('.ad-starters'), kind: 'starter_decks', owned: false, title: 'Decks préconstruits',
    intro: 'À sa première connexion, chaque joueur choisit un de ces decks : il reçoit toutes ses cartes et le deck tout prêt. Seuls les decks valides (50 cartes) sont proposés.',
  });

  // ---------- invitations ----------
  const ivMsg = (t, err = false) => { q('.iv-msg').textContent = t; q('.iv-msg').classList.toggle('err', err); };
  const starterName = (id) => S.starters.find((d) => d.id === id)?.name || '—';
  const linkBox = (token) => `<div class="row-btns iv-link"><input readonly value="${esc(inviteLink(token))}">
    <button type="button" class="btn small" data-copy="${esc(token)}">Copier le lien</button></div>`;
  function fillStarters() {
    const keep = q('.iv-starter').value;
    q('.iv-starter').innerHTML = '<option value="">Sans deck de départ</option>'
      + S.starters.filter((d) => validateDeck(d, { owned: false }).ok).map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    q('.iv-starter').value = keep;
  }
  async function refreshInvites() {
    let list;
    try { list = await listInvites(); } catch (e) { ivMsg(e.message, true); return; }
    q('.iv-list').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Pseudo</th><th>Deck</th><th>Boosters</th><th>État</th><th></th></tr></thead><tbody>
      ${list.map((v) => `<tr><td>${esc(v.username)}</td><td>${esc(starterName(v.starter_id))}</td><td>${v.boosters}</td>
        <td>${v.used_by ? '<span class="badge ok">Utilisée</span>' : '<span class="badge">En attente</span>'}</td>
        <td class="row-btns">${v.used_by ? '' : `<button type="button" class="btn small" data-copy="${esc(v.token)}">Copier le lien</button>`}
          <button type="button" class="btn small ghost" data-del="${esc(v.token)}">Supprimer</button></td></tr>`).join('')}
      </tbody></table>` : '<p class="muted small">Aucune invitation pour l\'instant.</p>';
  }
  q('.iv-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const token = await createInvite(q('.iv-name').value, q('.iv-starter').value, +q('.iv-n').value);
      ivMsg(`Lien créé pour ${q('.iv-name').value.trim().toLowerCase()} : envoyez-le-lui.`);
      q('.iv-new').innerHTML = linkBox(token);
      q('.iv-name').value = '';
      refreshInvites();
    } catch (err) { ivMsg(err.message, true); }
  });
  el.addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      navigator.clipboard?.writeText(inviteLink(copy.dataset.copy));
      copy.textContent = 'Copié ✓';
      return;
    }
    const del = e.target.closest('[data-del]')?.dataset.del;
    if (del && confirm('Supprimer cette invitation ? Le lien ne fonctionnera plus.')) {
      try { await deleteInvite(del); refreshInvites(); } catch (err) { ivMsg(err.message, true); }
    }
  });
  onChange(fillStarters);
  fillStarters();
  refreshInvites();

  refresh();
  document.querySelector('[data-tab=admin]').addEventListener('click', () => { refresh(); refreshInvites(); });
}
