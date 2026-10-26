// Game Master → Parties : rejoindre une partie en spectateur (avec son code), voir l'état complet des deux joueurs
// et corriger n'importe quoi. Chaque correction est appliquée chez le joueur concerné, puis transmise à son adversaire.
import { S, liveGames } from './store.js';
import { esc, cardHTML, RARITIES } from './cards.js';
import * as net from './net.js';

const ROLES = ['host', 'guest'];
const ZONES = [['chars', 'Personnages'], ['stage', 'Lieu'], ['hand', 'Main'], ['life', 'Vie'], ['trash', 'Défausse']];
const MOVES = [['hand', 'En main'], ['trash', 'À la défausse'], ['chars', 'Sur le terrain'], ['life', 'Dans la Vie'], ['deck', 'Dessus du deck'], ['deck-bottom', 'Dessous du deck']];

export function mountLive(el) {
  el.innerHTML = `
    <h3>Parties en cours</h3>
    <p class="muted small">Rejoins une partie en spectateur : tu vois tout (mains, Vies, deck) et tu corriges ce que tu veux.
      Les deux joueurs voient chaque correction, signée « Game Master ».</p>
    <div class="gl-list"></div>
    <div class="row-btns">
      <input class="gl-code" placeholder="Code de la partie" maxlength="8" aria-label="Code de la partie" style="text-transform:uppercase">
      <select class="gl-mode" aria-label="Type de partie"><option value="online">En ligne</option><option value="local">Locale (même navigateur)</option></select>
      <button class="btn" data-gl="join">Rejoindre en spectateur</button>
    </div>`;
  el.querySelector('[data-gl=join]').addEventListener('click', () => {
    const code = el.querySelector('.gl-code').value.trim().toUpperCase();
    if (code) openLive(code, el.querySelector('.gl-mode').value);
  });
  el.querySelector('.gl-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-live]');
    if (b) openLive(b.dataset.live, b.dataset.mode);
  });
  // Liste des parties en cours, rafraîchie toutes les 10 secondes quand l'onglet est affiché.
  const refresh = async () => {
    if (el.offsetParent === null || document.hidden) return;
    const list = await liveGames().catch(() => null);
    el.querySelector('.gl-list').innerHTML = !list ? '' : list.length
      ? `<table class="tbl"><tbody>${list.map((g) => `<tr><td><b>${esc(g.host || '?')}</b> contre <b>${esc(g.guest || '?')}</b></td>
        <td class="muted small">${esc(g.code)}${g.mode === 'local' ? ' · locale' : ''} · ${esc(g.phase || '')}</td>
        <td><button class="btn small" data-live="${esc(g.code)}" data-mode="${esc(g.mode)}">Rejoindre</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted small">Aucune partie en cours.</p>';
  };
  refresh();
  setInterval(refresh, 10000);
  document.querySelector('[data-tab=gm]')?.addEventListener('click', () => setTimeout(refresh, 50));
}

function openLive(code, mode) {
  const st = { host: null, guest: null };
  const ok = { host: false, guest: false };
  let menu = null; // { role, u }
  const ov = document.createElement('div');
  ov.className = 'gml';
  document.body.append(ov);
  const link = net.gmConnect(mode, code, {
    onStatus: (r, v) => { ok[r] = v; render(); },
    onMessage: (r, m) => { if (m?.t === 'gmState') { st[r] = m; render(); } },
  });
  const send = (role, op, extra = {}) => link.send(role, { t: 'gmCmd', op, ...extra });
  // Liste des cartes pour « Ajouter une carte » (nom → id).
  const byLabel = new Map();
  for (const c of S.cards) {
    if (c.type === 'leader') continue;
    const label = `${c.name}${c.alt ? ' (Alt)' : ''} · ${RARITIES[c.rarity]?.short || c.rarity}`;
    if (!byLabel.has(label)) byLabel.set(label, c.id);
  }

  function cardBtn(role, i, extra = '') {
    const c = S.byId[i.c];
    return `<button class="gml-card ${i.r ? 'rested' : ''} ${menu?.u === i.u ? 'on' : ''}" data-role="${role}" data-u="${esc(i.u)}" title="${esc(c?.name || i.c)}">
      ${cardHTML(c, { cls: 'mini' })}${i.m ? `<span class="gml-pw">${i.m > 0 ? '+' : ''}${i.m}</span>` : ''}${i.d ? `<span class="gml-don">+${i.d} DON</span>` : ''}${extra}</button>`;
  }

  function side(role) {
    const s = st[role];
    if (!s) return `<section class="gml-side"><h3>${role === 'host' ? 'Hôte' : 'Invité'}</h3><p class="muted">${ok[role] ? 'Connexion…' : 'En attente de ce joueur (sa partie doit être ouverte)…'}</p></section>`;
    const me = s.me;
    const turn = s.turn?.player === role;
    const zone = (k) => (k === 'stage' ? (me.stage ? [me.stage] : []) : me[k] || []);
    return `<section class="gml-side ${turn ? 'turn' : ''}" data-side="${role}">
      <h3>${esc(s.user || s.name)} ${turn ? '<span class="chip">à lui de jouer</span>' : ''} <small class="muted">${esc(s.phase)}${s.turn?.count ? ` · tour ${s.turn.count}` : ''}</small></h3>
      <div class="gml-counters">
        <div><b>Vies ${me.life.length}</b><button class="btn small" data-op="life+">+1</button><button class="btn small" data-op="life-hand">−1 en main</button><button class="btn small" data-op="life-trash">−1 défausse</button></div>
        <div><b>DON!!</b> ${me.donActive} actifs · ${me.donRested} reposés · ${me.donDeck} au deck
          <button class="btn small" data-op="don+">+1</button><button class="btn small" data-op="don-">−1</button><button class="btn small" data-op="donUntap">Redresser</button></div>
        <div><b>Main ${me.hand.length}</b> · <b>Deck ${me.deck.length}</b>
          <button class="btn small" data-op="draw">Piocher 1</button><button class="btn small" data-op="shuffle">Mélanger</button></div>
        <div><button class="btn small" data-op="untapAll">Tout redresser</button>
          ${turn ? '<button class="btn small" data-op="endTurn">Forcer la fin de son tour</button>' : ''}
          <button class="btn small danger" data-op="lose">Le déclarer perdant</button></div>
        <div class="gml-add"><input list="gml-cards" placeholder="Ajouter une carte…" aria-label="Carte à ajouter">
          <select aria-label="Où">${[['hand', 'en main'], ['chars', 'sur le terrain'], ['trash', 'à la défausse'], ['life', 'dans la Vie']].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <button class="btn small" data-op="add">Ajouter</button></div>
      </div>
      <div class="gml-zone"><span class="gml-zt">Leader</span><div class="gml-row">${me.leader ? cardBtn(role, me.leader) : ''}</div></div>
      ${ZONES.map(([k, l]) => `<div class="gml-zone" data-zone="${k}"><span class="gml-zt">${l} (${zone(k).length})</span><div class="gml-row">${zone(k).map((i) => cardBtn(role, i)).join('') || '<span class="muted small">vide</span>'}</div></div>`).join('')}
      <details class="gml-zone"><summary class="gml-zt">Deck : les 10 du dessus</summary><div class="gml-row">${me.deck.slice(0, 10).map((i) => cardBtn(role, i)).join('')}</div></details>
      <details class="gml-log"><summary>Journal</summary>${(s.log || []).slice(-25).map((x) => `<p class="${x.manual ? 'man' : ''}">${x.who === 'opp' ? '↔ ' : ''}${esc(x.text)}</p>`).join('')}</details>
    </section>`;
  }

  function menuHTML() {
    if (!menu) return '';
    const s = st[menu.role];
    const all = s && [s.me.leader, s.me.stage, ...['chars', 'hand', 'life', 'trash', 'deck'].flatMap((k) => s.me[k])].filter(Boolean);
    const i = all?.find((x) => x.u === menu.u);
    if (!i) return '';
    const leader = s.me.leader?.u === i.u;
    return `<div class="gml-menu"><b>${esc(S.byId[i.c]?.name || '')}</b>
      <button class="btn small" data-cop="tap">${i.r ? 'Redresser' : 'Reposer'}</button>
      <button class="btn small" data-cop="p+">+1000 ce tour</button><button class="btn small" data-cop="p-">−1000 ce tour</button>
      ${leader ? '' : `${MOVES.map(([k, l]) => `<button class="btn small" data-cop="mv:${k}">${l}</button>`).join('')}
      <button class="btn small danger" data-cop="remove">Retirer de la partie</button>`}
      <button class="btn small ghost" data-cop="close">Fermer</button></div>`;
  }

  function render() {
    const b = st.host?.battle || st.guest?.battle;
    // On garde ce qui est en train d'être tapé (la vue se redessine à chaque changement de la partie).
    const kept = [...ov.querySelectorAll('.gml-add')].map((x) => [x.closest('[data-side]')?.dataset.side, x.querySelector('input').value, x.querySelector('select').value]);
    const focused = document.activeElement?.closest?.('.gml-add')?.closest('[data-side]')?.dataset.side;
    ov.innerHTML = `<div class="gml-head"><h2>Game Master · partie ${esc(code)}</h2>
      <span class="gml-dot ${ok.host ? 'on' : ''}">Hôte</span><span class="gml-dot ${ok.guest ? 'on' : ''}">Invité</span>
      ${b ? '<button class="btn small" data-op="cancelBattle">Annuler le combat en cours</button>' : ''}
      <button class="btn small ghost" data-gl="close">Quitter</button></div>
      ${menuHTML()}
      <div class="gml-sides">${ROLES.map(side).join('')}</div>
      <datalist id="gml-cards">${[...byLabel.keys()].map((l) => `<option value="${esc(l)}"></option>`).join('')}</datalist>`;
    for (const [side, v, w] of kept) {
      const box = ov.querySelector(`[data-side="${side}"] .gml-add`);
      if (!box) continue;
      box.querySelector('input').value = v; box.querySelector('select').value = w;
      if (side === focused) box.querySelector('input').focus();
    }
  }

  ov.addEventListener('click', (e) => {
    if (e.target.closest('[data-gl=close]')) { link.close(); ov.remove(); return; }
    const card = e.target.closest('.gml-card');
    if (card) { menu = menu?.u === card.dataset.u ? null : { role: card.dataset.role, u: card.dataset.u }; render(); return; }
    const cop = e.target.closest('[data-cop]')?.dataset.cop;
    if (cop && menu) {
      const { role, u } = menu;
      if (cop === 'tap') send(role, 'tap', { u });
      else if (cop === 'p+' || cop === 'p-') send(role, 'power', { u, amount: cop === 'p+' ? 1000 : -1000 });
      else if (cop === 'remove') { if (confirm('Retirer cette carte de la partie ?')) send(role, 'remove', { u }); }
      else if (cop.startsWith('mv:')) { const to = cop.slice(3); send(role, 'move', { u, to: to === 'deck-bottom' ? 'deck' : to, pos: to === 'deck-bottom' ? 'bottom' : 'top' }); }
      menu = null; render();
      return;
    }
    const opBtn = e.target.closest('[data-op]');
    if (!opBtn) return;
    const op = opBtn.dataset.op;
    if (op === 'cancelBattle') { ROLES.forEach((r) => send(r, 'cancelBattle')); return; }
    const role = opBtn.closest('[data-side]')?.dataset.side;
    if (!role) return;
    if (op === 'lose' && !confirm('Déclarer ce joueur perdant ?')) return;
    if (op === 'add') {
      const box = opBtn.closest('.gml-add');
      const id = byLabel.get(box.querySelector('input').value);
      if (!id) { alert('Choisis une carte dans la liste.'); return; }
      send(role, 'add', { c: id, to: box.querySelector('select').value });
      box.querySelector('input').value = '';
      return;
    }
    send(role, op, op === 'draw' ? { n: 1 } : {});
  });
  render();
}
