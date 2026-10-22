// Onglet « Admin » : distribution de boosters, rôles et decks préconstruits.
import { S, isOwner, listPlayers, giveBoosters, setRole } from './store.js';
import { esc } from './cards.js';
import { createDeckBuilder } from './decks.js';

const ROLE = { owner: 'Propriétaire', admin: 'Admin', player: 'Joueur' };

export function initAdmin() {
  const el = document.getElementById('tab-admin');
  el.innerHTML = `
  <div class="admin">
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

  refresh();
  document.querySelector('[data-tab=admin]').addEventListener('click', refresh);
}
