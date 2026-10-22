// Onglet « Jouer » : salon de connexion + plateau de jeu 1v1.
// Chaque joueur gère ses propres cartes (comme sur une vraie table) ; l'adversaire reçoit
// une vue publique (main, deck et vie cachés) après chaque action.
import { S, validateDeck, onChange } from './store.js';
import {
  cardHTML, esc, uid, fmtEffect, TYPES, isBlocker, hasRush, hasDoubleAttack, hasBanish,
} from './cards.js';
import * as net from './net.js';

const root = () => document.getElementById('tab-play');
let G = null;
let link = null;
const lobby = { status: 'idle', code: '', error: '', deck: '', mode: 'online' };

// ---------- utilitaires ----------
const other = (r) => (r === 'host' ? 'guest' : 'host');
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const send = (m) => link?.send(m);
const myTurn = () => G?.phase === 'play' && G.turn.player === G.role;
const oppTurn = () => G?.phase === 'play' && G.turn.player === other(G.role);
const myCard = (inst) => G.myCards[inst.c];
const oppCard = (inst) => G.oppCards[inst.c];
const power = (inst, card, ownerTurn) => (Number(card?.power) || 0) + (inst.m || 0) + (ownerTurn ? (inst.d || 0) * 1000 : 0);
const myPower = (inst) => power(inst, myCard(inst), myTurn());
const oppPower = (inst) => power(inst, oppCard(inst), oppTurn());
const name = (c) => `« ${c?.name || '?'} »`;

const emptySide = () => ({
  leader: null, life: [], deck: [], hand: [], chars: [], stage: null, trash: [],
  donDeck: 10, donActive: 0, donRested: 0,
});

export function initPlay() {
  const p = new URLSearchParams(location.search);
  if (p.get('join')) lobby.joinCode = p.get('join');
  if (p.get('local')) lobby.mode = 'local';
  onChange(() => { if (!G) renderLobby(); });
  renderLobby();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && G?.select) { G.select = null; render(); }
  });
}

// ---------- salon ----------
function renderLobby() {
  const decks = S.decks.map((d) => ({ d, v: validateDeck(d) }));
  if (!lobby.deck || !decks.find((x) => x.d.id === lobby.deck && x.v.ok)) lobby.deck = decks.find((x) => x.v.ok)?.d.id || '';
  const savedName = localStorage.getItem('optcgm-name') || '';
  const waiting = lobby.status === 'waiting';
  const shareUrl = `${location.origin}${location.pathname}?join=${lobby.code}${lobby.mode === 'local' ? '&local=1' : ''}`;
  root().innerHTML = `
  <div class="lobby">
    <section class="panel">
      <h2>Jouer contre un ami</h2>
      <div class="grid2">
        <div class="field"><label for="lb-name">Votre pseudo</label><input id="lb-name" maxlength="20" value="${esc(savedName)}" placeholder="Pseudo"></div>
        <div class="field"><label for="lb-deck">Votre deck</label>
          <select id="lb-deck">${decks.map(({ d, v }) => `<option value="${d.id}" ${v.ok ? '' : 'disabled'} ${d.id === lobby.deck ? 'selected' : ''}>${esc(d.name)}${v.ok ? '' : ` (invalide : ${v.total}/50)`}</option>`).join('')}</select></div>
      </div>
      ${lobby.deck ? '' : '<p class="msg err">Il vous faut un deck valide (1 Leader + 50 cartes) : allez dans l\'onglet <b>Decks</b>.</p>'}
      <div class="lobby-actions">
        <div class="box">
          <h3>Créer une partie</h3>
          ${waiting ? `
            <p>Envoyez ce code (ou le lien) à votre ami :</p>
            <div class="code">${esc(lobby.code)}</div>
            <div class="row-btns"><input readonly value="${esc(shareUrl)}" id="lb-url"><button class="btn" id="lb-copy">Copier le lien</button></div>
            <p class="muted small">En attente de votre adversaire… Gardez cette page ouverte.</p>
            <button class="btn ghost" id="lb-cancel">Annuler</button>`
          : `<p class="muted">Vous obtenez un code à envoyer à votre ami.</p>
            <button class="btn primary" id="lb-host" ${lobby.deck && lobby.status === 'idle' ? '' : 'disabled'}>Créer une partie</button>`}
        </div>
        <div class="box">
          <h3>Rejoindre une partie</h3>
          <p class="muted">Entrez le code reçu de votre ami.</p>
          <div class="row-btns"><input id="lb-code" maxlength="6" placeholder="CODE" value="${esc(lobby.joinCode || '')}" class="code-input">
          <button class="btn primary" id="lb-join" ${lobby.deck && lobby.status === 'idle' ? '' : 'disabled'}>Rejoindre</button></div>
        </div>
      </div>
      ${lobby.status === 'connecting' ? '<p class="msg">Connexion…</p>' : ''}
      ${lobby.error ? `<p class="msg err">${esc(lobby.error)}</p>` : ''}
      <details class="small"><summary>Tester seul sur cet ordinateur</summary>
        <p class="muted">Cochez la case, créez une partie, puis ouvrez le lien dans un deuxième onglet de ce navigateur.</p>
        <label><input type="checkbox" id="lb-local" ${lobby.mode === 'local' ? 'checked' : ''}> Mode local (deux onglets)</label>
      </details>
    </section>
  </div>`;
  const r = root();
  r.querySelector('#lb-deck').addEventListener('change', (e) => { lobby.deck = e.target.value; });
  r.querySelector('#lb-name').addEventListener('input', (e) => localStorage.setItem('optcgm-name', e.target.value));
  r.querySelector('#lb-local').addEventListener('change', (e) => { lobby.mode = e.target.checked ? 'local' : 'online'; });
  r.querySelector('#lb-code').addEventListener('input', (e) => { lobby.joinCode = e.target.value.toUpperCase(); });
  r.querySelector('#lb-host')?.addEventListener('click', () => connect(true));
  r.querySelector('#lb-join')?.addEventListener('click', () => {
    if (!lobby.joinCode?.trim()) { lobby.error = 'Entrez un code.'; renderLobby(); return; }
    connect(false, lobby.joinCode);
  });
  r.querySelector('#lb-copy')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(shareUrl);
    r.querySelector('#lb-copy').textContent = 'Copié ✓';
  });
  r.querySelector('#lb-cancel')?.addEventListener('click', () => {
    link?.close(); link = null; G = null;
    Object.assign(lobby, { status: 'idle', code: '', error: '' });
    renderLobby();
  });
}

function connect(isHost, code) {
  const deck = S.decks.find((d) => d.id === lobby.deck);
  if (!deck || !validateDeck(deck).ok) return;
  if (lobby.mode === 'online' && !window.Peer) {
    lobby.error = 'Le module de connexion n\'a pas pu se charger. Vérifiez votre connexion Internet et rechargez la page.';
    renderLobby();
    return;
  }
  G = newGame(isHost ? 'host' : 'guest', deck, localStorage.getItem('optcgm-name') || (isHost ? 'Joueur 1' : 'Joueur 2'));
  Object.assign(lobby, { status: 'connecting', error: '' });
  renderLobby();
  const h = {
    onReady: (c) => { lobby.code = c; lobby.status = 'waiting'; renderLobby(); },
    onOpen: () => {
      G.connected = true;
      lobby.status = 'playing';
      send({ t: 'hello', name: G.name, cards: G.myCards });
      sys('Connecté. Échange des decks…');
      render();
    },
    onMessage: (m) => { try { onMsg(m); } catch (e) { console.error(e); } },
    onClose: () => { if (G) { G.disconnected = true; sys('Votre adversaire s\'est déconnecté.'); render(); } },
    onError: (t) => {
      if (G?.connected) { sys(t); render(); return; }
      link?.close(); link = null; G = null;
      Object.assign(lobby, { status: 'idle', error: t });
      renderLobby();
    },
  };
  link = isHost ? net.host(lobby.mode, h) : net.join(lobby.mode, code, h);
}

function newGame(role, deck, playerName) {
  const myCards = {};
  [deck.leader, ...Object.keys(deck.cards)].forEach((id) => { myCards[id] = S.byId[id]; });
  return {
    role, name: playerName, deckDef: structuredClone(deck), myCards, oppCards: {}, oppName: 'Adversaire',
    connected: false, disconnected: false, oppHello: false,
    phase: 'hello', // hello → choose → mulligan → ready → play → over
    coinWinner: null, first: null, turn: { player: null, count: 0 },
    me: emptySide(), opp: null, meReady: false, oppReady: false,
    battle: null, select: null, log: [], winner: null, reveals: [], preview: null,
  };
}

// ---------- messages réseau ----------
function onMsg(m) {
  switch (m.t) {
    case 'hello':
      G.oppName = m.name || 'Adversaire';
      G.oppCards = m.cards || {};
      G.oppHello = true;
      sys(`${G.oppName} a rejoint la partie.`);
      if (G.role === 'host') coinFlip();
      break;
    case 'coin': applyCoin(m.winner); break;
    case 'first': applyFirst(m.first); break;
    case 'view': G.opp = m.v; break;
    case 'ready': G.oppReady = true; maybeStart(); break;
    case 'turn': G.turn = { player: m.player, count: m.count }; break;
    case 'endTurn': beginTurn(m.count + 1); return;
    case 'log': G.log.push({ who: 'opp', text: m.text }); break;
    case 'chat': G.log.push({ who: 'opp', text: m.text, chat: true }); break;
    case 'reveal': G.reveals.push({ id: uid(), c: m.c, why: m.why }); break;
    case 'attack': G.battle = { ...m.b, role: 'def' }; break;
    case 'battleUpd': if (G.battle) Object.assign(G.battle, m.b); break;
    case 'battleEnd': G.battle = null; G.select = null; break;
    case 'gameover': G.phase = 'over'; G.winner = m.winner; G.overReason = m.reason; break;
    case 'rematch': resetMatch(); return;
    default: break;
  }
  render();
}

function log(text) {
  G.log.push({ who: 'me', text });
  send({ t: 'log', text });
}
function sys(text) { G?.log.push({ who: 'sys', text }); }

function pub() {
  const m = G.me;
  return {
    leader: m.leader, chars: m.chars, stage: m.stage, trash: m.trash,
    hand: m.hand.length, deck: m.deck.length, life: m.life.length,
    donDeck: m.donDeck, donActive: m.donActive, donRested: m.donRested,
    phase: G.phase,
  };
}

function commit() {
  if (G.phase === 'play' && G.me.deck.length === 0) { lose('Son deck est vide.'); return; }
  send({ t: 'view', v: pub() });
  render();
}

// ---------- mise en place ----------
function coinFlip() {
  const w = Math.random() < 0.5 ? 'host' : 'guest';
  send({ t: 'coin', winner: w });
  applyCoin(w);
}
function applyCoin(w) {
  G.coinWinner = w;
  G.phase = 'choose';
  sys(`Tirage au sort : ${w === G.role ? 'vous gagnez' : `${G.oppName} gagne`}.`);
}
function chooseFirst(meFirst) {
  const f = meFirst ? G.role : other(G.role);
  send({ t: 'first', first: f });
  applyFirst(f);
}
function applyFirst(f) {
  G.first = f;
  sys(`${f === G.role ? 'Vous commencez' : `${G.oppName} commence`}.`);
  const me = G.me;
  const leaderId = G.deckDef.leader;
  me.leader = { u: uid(), c: leaderId, r: false, d: 0, m: 0 };
  me.deck = shuffle(Object.entries(G.deckDef.cards).flatMap(([c, n]) =>
    Array.from({ length: n }, () => ({ u: uid(), c, r: false, d: 0, m: 0 }))));
  me.hand = me.deck.splice(0, 5);
  G.phase = 'mulligan';
  commit();
}
function finishMulligan(redo) {
  const me = G.me;
  if (redo) {
    me.deck.push(...me.hand);
    me.hand = [];
    shuffle(me.deck);
    me.hand = me.deck.splice(0, 5);
    log('fait un mulligan.');
  } else log('garde sa main.');
  // La carte du dessus du deck va en bas de la Vie : la fin du tableau = dessus de la Vie.
  const n = Number(myCard(me.leader).life) || 5;
  for (let i = 0; i < n && me.deck.length; i++) me.life.push(me.deck.shift());
  G.phase = 'ready';
  G.meReady = true;
  send({ t: 'ready' });
  maybeStart();
  if (G.phase !== 'play') commit();
}
function maybeStart() {
  if (!(G.meReady && G.oppReady) || G.phase !== 'ready') return;
  G.phase = 'play';
  if (G.first === G.role) beginTurn(1);
  else commit();
}

// ---------- tours ----------
function fieldInsts() { return [G.me.leader, ...G.me.chars, G.me.stage].filter(Boolean); }

function beginTurn(count) {
  const me = G.me;
  G.turn = { player: G.role, count };
  G.battle = null;
  send({ t: 'turn', player: G.role, count });
  const first = count === 1;
  // Phase de rafraîchissement
  let back = 0;
  for (const i of fieldInsts()) { back += i.d || 0; i.d = 0; i.r = false; }
  me.donActive += me.donRested + back;
  me.donRested = 0;
  log(`— Tour ${count} : ${G.name} —`);
  // Phase de pioche (le premier joueur ne pioche pas à son premier tour)
  if (!first) {
    if (!me.deck.length) { lose('Plus de carte à piocher.'); return; }
    me.hand.push(me.deck.shift());
  }
  // Phase DON!!
  const n = Math.min(first ? 1 : 2, me.donDeck);
  me.donDeck -= n;
  me.donActive += n;
  log(`${first ? 'ne pioche pas (1er tour)' : 'pioche 1 carte'} et reçoit ${n} DON!!.`);
  commit();
}

function endTurn() {
  if (G.battle) return toast('Terminez le combat en cours d\'abord.');
  for (const i of fieldInsts()) i.m = 0;
  log('termine son tour.');
  G.turn = { player: other(G.role), count: G.turn.count };
  G.select = null;
  commit();
  send({ t: 'endTurn', count: G.turn.count });
}

function lose(reason) {
  if (G.phase === 'over') return;
  G.phase = 'over';
  G.winner = other(G.role);
  G.overReason = reason;
  G.battle = null;
  log(`a perdu : ${reason}`);
  send({ t: 'gameover', winner: G.winner, reason });
  send({ t: 'view', v: pub() });
  render();
}

function resetMatch() {
  Object.assign(G, {
    phase: 'hello', coinWinner: null, first: null, turn: { player: null, count: 0 }, me: emptySide(), opp: null,
    meReady: false, oppReady: false, battle: null, select: null, winner: null, reveals: [],
  });
  sys('Nouvelle partie !');
  if (G.role === 'host') coinFlip();
  commit();
}

// ---------- déplacements de cartes ----------
function locate(u) {
  const me = G.me;
  if (me.leader?.u === u) return { zone: 'leader', inst: me.leader };
  if (me.stage?.u === u) return { zone: 'stage', inst: me.stage };
  for (const z of ['hand', 'chars', 'trash', 'life', 'deck']) {
    const i = me[z].findIndex((x) => x.u === u);
    if (i >= 0) return { zone: z, inst: me[z][i], idx: i };
  }
  return null;
}

// pos : 'top' ou 'bottom' (deck : index 0 = dessus ; vie : fin du tableau = dessus)
function move(u, to, pos = 'top') {
  const loc = locate(u);
  if (!loc || loc.zone === 'leader') return null;
  const me = G.me;
  const { inst } = loc;
  if (loc.zone === 'stage') me.stage = null; else me[loc.zone].splice(loc.idx, 1);
  if (loc.zone === 'chars' || loc.zone === 'stage') {
    me.donRested += inst.d || 0; // les DON!! attachés retournent dans la zone de coût, reposés
    Object.assign(inst, { d: 0, r: false, m: 0 });
  }
  if (to === 'stage') {
    if (me.stage) move(me.stage.u, 'trash');
    me.stage = inst;
    inst.t = G.turn.count;
  } else if (to === 'deck') {
    if (pos === 'top') me.deck.unshift(inst); else me.deck.push(inst);
  } else if (to === 'life') {
    if (pos === 'top') me.life.push(inst); else me.life.unshift(inst);
  } else {
    if (to === 'chars') inst.t = G.turn.count;
    me[to].push(inst);
  }
  return inst;
}

function reveal(inst, why) {
  send({ t: 'reveal', c: inst.c, why });
}

async function playCard(u, free = false) {
  const loc = locate(u);
  if (!loc) return;
  const c = myCard(loc.inst);
  const cost = free ? 0 : Number(c.cost) || 0;
  if (cost > G.me.donActive) return toast(`Pas assez de DON!! actifs : il en faut ${cost}.`);
  if (c.type === 'character' && G.me.chars.length >= 5) {
    const victim = await pickCard('Zone pleine (5 Personnages) : choisissez celui à défausser', G.me.chars, myCard);
    if (!victim) return;
    move(victim.u, 'trash');
    log(`défausse ${name(myCard(victim))} pour faire de la place.`);
  }
  G.me.donActive -= cost;
  G.me.donRested += cost;
  const from = loc.zone === 'hand' ? '' : ` depuis ${zoneName(loc.zone)}`;
  if (c.type === 'character') { move(u, 'chars'); log(`joue ${name(c)}${from}${cost ? ` (coût ${cost})` : ''}.`); }
  else if (c.type === 'stage') { move(u, 'stage'); log(`joue le Lieu ${name(c)}${from}${cost ? ` (coût ${cost})` : ''}.`); }
  else if (c.type === 'event') {
    move(u, 'trash');
    reveal(loc.inst, 'Événement activé');
    log(`active l'Événement ${name(c)}${cost ? ` (coût ${cost})` : ''}.`);
  }
  commit();
}

const zoneName = (z) => ({
  hand: 'la main', chars: 'le terrain', trash: 'la défausse', life: 'la Vie', deck: 'le deck', stage: 'le terrain',
}[z] || z);

// ---------- combat ----------
function startAttack(inst) {
  if (G.turn.count <= 2) return toast('Personne ne peut attaquer pendant son premier tour.');
  const c = myCard(inst);
  if (c.type === 'character' && inst.t === G.turn.count && !hasRush(c)
    && !confirm(`${c.name} a été joué ce tour et n'a pas [Initiative]. Attaquer quand même ?`)) return;
  G.select = { kind: 'attack', attacker: inst.u };
  render();
}

function declareAttack(targetInst, isLeader) {
  const atk = locate(G.select.attacker)?.inst;
  G.select = null;
  if (!atk) return;
  const c = myCard(atk);
  atk.r = true;
  G.battle = {
    role: 'atk', step: 'attack', attacker: atk.u, attackerCard: atk.c, target: targetInst.u, targetCard: targetInst.c,
    targetIsLeader: isLeader, counter: 0, blocker: null, double: hasDoubleAttack(c), banish: hasBanish(c),
  };
  log(`attaque ${name(oppCard(targetInst))} avec ${name(c)}.`);
  commit();
}

function sendAttack() {
  const b = G.battle;
  const atk = locate(b.attacker)?.inst;
  if (!atk) { G.battle = null; return commit(); }
  b.atkPower = myPower(atk);
  b.step = 'defense';
  const { role, ...wire } = b;
  send({ t: 'attack', b: wire });
  log(`confirme l'attaque : ${b.atkPower} de puissance${b.double ? ' (Double attaque)' : ''}${b.banish ? ' (Exil)' : ''}.`);
  commit();
}

function cancelAttack() {
  const atk = locate(G.battle.attacker)?.inst;
  if (atk) atk.r = false;
  G.battle = null;
  log('annule son attaque.');
  commit();
}

function battleUpd() {
  const { counter, blocker, target, targetCard, targetIsLeader } = G.battle;
  send({ t: 'battleUpd', b: { counter, blocker, target, targetCard, targetIsLeader } });
  commit();
}

function block(inst) {
  const c = myCard(inst);
  if (!isBlocker(c) && !confirm(`${c.name} n'a pas [Bloqueur]. Bloquer quand même ?`)) return;
  inst.r = true;
  Object.assign(G.battle, { blocker: inst.u, target: inst.u, targetCard: inst.c, targetIsLeader: false });
  log(`bloque avec ${name(c)}.`);
  battleUpd();
}

function counterChar(inst) {
  const c = myCard(inst);
  move(inst.u, 'trash');
  G.battle.counter += Number(c.counter) || 0;
  reveal(inst, `Contre +${c.counter}`);
  log(`utilise ${name(c)} en Contre (+${c.counter}).`);
  battleUpd();
}

async function counterEvent(inst) {
  const c = myCard(inst);
  const cost = Number(c.cost) || 0;
  if (cost > G.me.donActive) return toast(`Pas assez de DON!! actifs : il en faut ${cost}.`);
  const bonus = await ask(`Contre : ${c.name}`, `<div class="ask-card">${cardHTML(c)}</div><p>Quel bonus de puissance donne cet Événement ? (0 si l'effet est autre)</p>`,
    [0, 1000, 2000, 3000, 4000, 5000, 6000].map((v) => ({ label: v ? `+${v}` : '0', value: v })).concat({ label: 'Annuler', value: null, cls: 'ghost' }));
  if (bonus === null || !G.battle) return;
  G.me.donActive -= cost;
  G.me.donRested += cost;
  move(inst.u, 'trash');
  G.battle.counter += bonus;
  reveal(inst, 'Événement [Contre]');
  log(`active ${name(c)} en Contre${bonus ? ` (+${bonus})` : ''}.`);
  battleUpd();
}

async function resolveBattle() {
  const b = G.battle;
  if (b.resolving) return;
  b.resolving = true;
  const tgt = locate(b.target)?.inst;
  const fieldZone = tgt && ['leader', 'chars'].includes(locate(b.target).zone);
  if (tgt && fieldZone) {
    const def = myPower(tgt) + b.counter;
    const tc = myCard(tgt);
    if (b.atkPower >= def) {
      if (b.targetIsLeader) {
        log(`subit l'attaque sur son Leader (${b.atkPower} contre ${def}).`);
        const lost = await takeDamage(b.double ? 2 : 1, b.banish);
        if (lost) return;
      } else {
        move(tgt.u, 'trash');
        log(`voit ${name(tc)} mis KO (${b.atkPower} contre ${def}).`);
      }
    } else log(`repousse l'attaque (${b.atkPower} contre ${def}).`);
  } else log('constate que l\'attaque n\'a plus de cible.');
  G.battle = null;
  send({ t: 'battleEnd' });
  commit();
}

// Retourne true si le joueur a perdu.
async function takeDamage(n, banish) {
  for (let k = 0; k < n; k++) {
    const me = G.me;
    if (!me.life.length) { lose('Son Leader a été touché sans carte Vie restante.'); return true; }
    const inst = me.life.pop();
    const c = myCard(inst);
    if (banish) {
      me.trash.push(inst);
      log(`perd 1 Vie (Exil) : ${name(c)} va à la défausse.`);
      reveal(inst, 'Vie exilée');
      continue;
    }
    if (c.trigger) {
      commit();
      const choice = await ask('Déclenchement !', `<div class="ask-card">${cardHTML(c)}</div><p>Cette carte Vie a un effet <b>Déclenchement</b>.</p>`, [
        { label: 'Activer le Déclenchement', value: 'trig', cls: 'primary' },
        { label: 'Ajouter à la main', value: 'hand' },
      ]);
      if (choice === 'trig') {
        reveal(inst, 'Déclenchement');
        log(`révèle ${name(c)} et active son Déclenchement : ${c.trigger}`);
        const where = await ask('Après le Déclenchement', `<p>Où va ${esc(c.name)} ?</p>`, [
          { label: 'Défausse', value: 'trash', cls: 'primary' },
          ...(c.type === 'character' || c.type === 'stage' ? [{ label: 'Jouer sur le terrain', value: 'play' }] : []),
          { label: 'Main', value: 'hand' },
        ]);
        if (where === 'play') {
          me.hand.push(inst);
          await playCard(inst.u, true);
        } else me[where || 'trash'].push(inst);
        continue;
      }
    }
    me.hand.push(inst);
    log('perd 1 Vie (ajoutée à la main).');
  }
  return false;
}

// ---------- menus d'actions ----------
function menuForCard(u) {
  const loc = locate(u);
  if (!loc) return [];
  const { zone, inst } = loc;
  const c = myCard(inst);
  const b = G.battle;
  const defending = b?.role === 'def';
  const it = [];
  const act = (label, fn, opt = {}) => it.push({ label, fn, ...opt });
  const done = (msg) => () => { if (msg) log(msg); commit(); };
  const playable = c.type !== 'leader';

  if (zone === 'hand') {
    if (defending && c.type === 'character' && Number(c.counter) > 0) act(`🛡 Contre +${c.counter}`, () => counterChar(inst), { cls: 'hl' });
    if (defending && c.type === 'event') act('🛡 Jouer en Contre (Événement)', () => counterEvent(inst), { cls: 'hl' });
    if (myTurn() && !b) act(`▶ Jouer (coût ${c.cost || 0})`, () => playCard(u), { cls: 'hl' });
    act('Jouer sans payer le coût', () => playCard(u, true));
    act('Défausser', () => { move(u, 'trash'); done(`défausse ${name(c)} de sa main.`)(); });
    act('Révéler à l\'adversaire', () => { reveal(inst, 'Carte révélée'); log(`révèle ${name(c)}.`); commit(); });
    act('Placer sur le dessus du deck', () => { move(u, 'deck', 'top'); done('place une carte de sa main sur son deck.')(); });
    act('Placer sous le deck', () => { move(u, 'deck', 'bottom'); done('place une carte de sa main sous son deck.')(); });
    act('Ajouter sur la Vie (face cachée)', () => { move(u, 'life', 'top'); done('ajoute une carte de sa main à sa Vie.')(); });
  } else if (zone === 'leader' || zone === 'chars' || zone === 'stage') {
    if (zone !== 'stage' && myTurn() && !b && !inst.r) act('⚔ Attaquer', () => startAttack(inst), { cls: 'hl' });
    if (defending && zone === 'chars' && !inst.r && !b.blocker && b.target !== inst.u) {
      act(`🛡 Bloquer${isBlocker(c) ? '' : ' (sans [Bloqueur])'}`, () => block(inst), { cls: isBlocker(c) ? 'hl' : '' });
    }
    act(inst.r ? 'Redresser (actif)' : 'Reposer', () => { inst.r = !inst.r; done(`${inst.r ? 'repose' : 'redresse'} ${name(c)}.`)(); });
    if (zone !== 'stage') {
      act(`Attacher 1 DON!! (${G.me.donActive} actif${G.me.donActive > 1 ? 's' : ''})`, () => {
        G.me.donActive--; inst.d = (inst.d || 0) + 1; done(`attache 1 DON!! à ${name(c)}.`)();
      }, { disabled: !G.me.donActive });
      if (inst.d) {
        act('Détacher 1 DON!! (→ zone de coût, reposé)', () => { inst.d--; G.me.donRested++; done(`détache 1 DON!! de ${name(c)}.`)(); });
        act('Renvoyer 1 DON!! attaché au deck DON!!', () => { inst.d--; G.me.donDeck++; done(`renvoie 1 DON!! de ${name(c)} au deck DON!!.`)(); });
      }
      act('+1000 puissance (jusqu\'à la fin du tour)', () => { inst.m = (inst.m || 0) + 1000; done(`${name(c)} gagne +1000.`)(); });
      act('−1000 puissance (jusqu\'à la fin du tour)', () => { inst.m = (inst.m || 0) - 1000; done(`${name(c)} perd 1000.`)(); });
      if (inst.m) act('Annuler les modifs de puissance', () => { inst.m = 0; done(`${name(c)} revient à sa puissance normale.`)(); });
    }
    if (zone !== 'leader') {
      act('KO / Défausser', () => { move(u, 'trash'); done(`${name(c)} va à la défausse.`)(); }, { sep: true });
      act('Renvoyer en main', () => { move(u, 'hand'); done(`renvoie ${name(c)} en main.`)(); });
      act('Placer sur le dessus du deck', () => { move(u, 'deck', 'top'); done(`place ${name(c)} sur son deck.`)(); });
      act('Placer sous le deck', () => { move(u, 'deck', 'bottom'); done(`place ${name(c)} sous son deck.`)(); });
      act('Ajouter sur la Vie', () => { move(u, 'life', 'top'); done(`ajoute ${name(c)} à sa Vie.`)(); });
    }
  } else {
    // carte vue dans le deck, la défausse ou la Vie
    const src = zoneName(zone);
    const hidden = zone !== 'trash';
    act('Ajouter à la main', () => { move(u, 'hand'); done(hidden ? `ajoute une carte de ${src} à sa main.` : `ajoute ${name(c)} de la défausse à sa main.`)(); }, { cls: 'hl' });
    if (hidden) act('Ajouter à la main en la révélant', () => { reveal(inst, `Ajoutée depuis ${src}`); move(u, 'hand'); done(`révèle ${name(c)} et l'ajoute à sa main.`)(); });
    if (playable) act('Jouer sans payer le coût', () => playCard(u, true));
    if (zone !== 'trash') act('Défausser', () => { move(u, 'trash'); done(`défausse ${name(c)} depuis ${src}.`)(); });
    act('Placer sur le dessus du deck', () => { move(u, 'deck', 'top'); done(`place une carte de ${src} sur son deck.`)(); });
    act('Placer sous le deck', () => { move(u, 'deck', 'bottom'); done(`place une carte de ${src} sous son deck.`)(); });
    if (zone !== 'life') act('Ajouter sur la Vie', () => { move(u, 'life', 'top'); done(`ajoute une carte de ${src} à sa Vie.`)(); });
  }
  return it;
}

function menuForPile(pile) {
  const me = G.me;
  const it = [];
  const act = (label, fn, opt = {}) => it.push({ label, fn, ...opt });
  if (pile === 'deck') {
    act('Piocher 1 carte', () => { if (me.deck.length) { me.hand.push(me.deck.shift()); log('pioche 1 carte.'); } commit(); }, { cls: 'hl' });
    act('Regarder les cartes du dessus…', async () => {
      const n = await ask('Regarder le dessus du deck', '<p>Combien de cartes ?</p>',
        [1, 2, 3, 4, 5, 6, 7].map((v) => ({ label: String(v), value: v })).concat({ label: 'Annuler', value: null, cls: 'ghost' }));
      if (!n) return;
      log(`regarde les ${n} cartes du dessus de son deck.`);
      openViewer('deck', n);
    });
    act('Chercher dans tout le deck', () => { log('cherche dans son deck.'); openViewer('deck'); });
    act('Mélanger le deck', () => { shuffle(me.deck); log('mélange son deck.'); commit(); });
    act('Défausser la carte du dessus', () => {
      const i = me.deck[0]; if (!i) return; move(i.u, 'trash'); log(`défausse ${name(myCard(i))} du dessus de son deck.`); commit();
    });
    act('Révéler la carte du dessus', () => {
      const i = me.deck[0]; if (!i) return; reveal(i, 'Dessus du deck'); log(`révèle ${name(myCard(i))} (dessus du deck).`); commit();
    });
    act('Ajouter la carte du dessus à la Vie', () => {
      const i = me.deck[0]; if (!i) return; move(i.u, 'life', 'top'); log('ajoute la carte du dessus de son deck à sa Vie.'); commit();
    });
  } else if (pile === 'life') {
    act('Prendre 1 Vie en main (dégât manuel)', async () => { await takeDamage(1, false); commit(); }, { cls: 'hl' });
    act('Ajouter la Vie du dessus à la main', () => {
      const i = me.life.at(-1); if (!i) return; move(i.u, 'hand'); log('ajoute la carte du dessus de sa Vie à sa main.'); commit();
    });
    act('Défausser la Vie du dessus', () => {
      const i = me.life.at(-1); if (!i) return; move(i.u, 'trash'); log(`défausse ${name(myCard(i))} depuis sa Vie.`); commit();
    });
    act('Regarder ma Vie', () => { log('regarde ses cartes Vie.'); openViewer('life'); });
  } else if (pile === 'trash') {
    openViewer('trash');
    return null;
  } else if (pile === 'don') {
    act('Reposer 1 DON!!', () => { if (me.donActive) { me.donActive--; me.donRested++; log('repose 1 DON!!.'); } commit(); }, { disabled: !me.donActive });
    act('Redresser 1 DON!!', () => { if (me.donRested) { me.donRested--; me.donActive++; log('redresse 1 DON!!.'); } commit(); }, { disabled: !me.donRested });
    act('+1 DON!! depuis le deck DON!! (actif)', () => { if (me.donDeck) { me.donDeck--; me.donActive++; log('ajoute 1 DON!! actif.'); } commit(); }, { disabled: !me.donDeck });
    act('+1 DON!! depuis le deck DON!! (reposé)', () => { if (me.donDeck) { me.donDeck--; me.donRested++; log('ajoute 1 DON!! reposé.'); } commit(); }, { disabled: !me.donDeck });
    act('Renvoyer 1 DON!! actif au deck DON!!', () => { if (me.donActive) { me.donActive--; me.donDeck++; log('renvoie 1 DON!! au deck DON!!.'); } commit(); }, { disabled: !me.donActive });
    act('Renvoyer 1 DON!! reposé au deck DON!!', () => { if (me.donRested) { me.donRested--; me.donDeck++; log('renvoie 1 DON!! au deck DON!!.'); } commit(); }, { disabled: !me.donRested });
  }
  return it;
}

function showMenu(items, x, y) {
  closeMenu();
  if (!items?.length) return;
  const m = document.createElement('div');
  m.className = 'menu';
  m.id = 'menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => `${it.sep ? '<hr>' : ''}<button role="menuitem" data-i="${i}" class="${it.cls || ''}" ${it.disabled ? 'disabled' : ''}>${esc(it.label)}</button>`).join('');
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  m.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
  m.addEventListener('click', (e) => {
    const i = e.target.closest('[data-i]')?.dataset.i;
    if (i === undefined) return;
    closeMenu();
    items[i].fn();
  });
  setTimeout(() => document.addEventListener('pointerdown', outside));
}
function outside(e) { if (!e.target.closest('#menu')) closeMenu(); }
function closeMenu() {
  document.getElementById('menu')?.remove();
  document.removeEventListener('pointerdown', outside);
}

// ---------- fenêtres ----------
function ask(title, html, buttons) {
  return new Promise((resolve) => {
    const o = document.createElement('div');
    o.className = 'overlay';
    o.innerHTML = `<div class="dialog" role="dialog" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${html}
      <div class="row-btns">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    document.body.append(o);
    o.addEventListener('click', (e) => {
      const i = e.target.closest('[data-i]')?.dataset.i;
      if (i === undefined) return;
      o.remove();
      resolve(buttons[i].value);
    });
  });
}

function pickCard(title, insts, getCard) {
  return new Promise((resolve) => {
    const o = document.createElement('div');
    o.className = 'overlay';
    o.innerHTML = `<div class="dialog wide"><h3>${esc(title)}</h3>
      <div class="card-grid">${insts.map((i, k) => `<button class="grid-card" data-k="${k}">${cardHTML(getCard(i))}</button>`).join('')}</div>
      <div class="row-btns"><button class="btn ghost" data-k="-1">Annuler</button></div></div>`;
    document.body.append(o);
    o.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (k === undefined) return;
      o.remove();
      resolve(k === '-1' ? null : insts[+k]);
    });
  });
}

function openViewer(zone, count = null, side = 'me') { G.viewer = { zone, count, side }; render(); }

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

// ---------- rendu ----------
function slot(inst, side, zone) {
  const mine = side === 'me';
  const c = mine ? myCard(inst) : oppCard(inst);
  const pw = c && (c.type === 'leader' || c.type === 'character') ? (mine ? myPower(inst) : oppPower(inst)) : undefined;
  const cls = ['slot'];
  if (inst.r) cls.push('rested');
  if (G.select?.kind === 'attack' && !mine && (zone === 'leader' || (zone === 'chars' && inst.r))) cls.push('target');
  if (G.select?.attacker === inst.u) cls.push('attacking');
  if (G.battle && (G.battle.attacker === inst.u)) cls.push('attacking');
  if (G.battle && (G.battle.target === inst.u)) cls.push('defending');
  return `<div class="${cls.join(' ')}" data-u="${inst.u}" data-side="${side}" data-zone="${zone}" data-cid="${inst.c}" tabindex="0">
    ${cardHTML(c, { power: pw })}${inst.d ? `<span class="don-badge" title="DON!! attachés">+${inst.d} DON</span>` : ''}</div>`;
}

function pile(kind, side, n, label, top) {
  const face = top ? cardHTML(top) : n ? cardHTML(null) : '<div class="card empty-pile"></div>';
  return `<div class="pile p-${kind}" data-pile="${kind}" data-side="${side}" ${top ? `data-cid="${top.c || ''}"` : ''} tabindex="0" role="button" aria-label="${label} (${n})">
    ${face}<span class="count">${n}</span><span class="lbl">${label}</span></div>`;
}

function donArea(side, d) {
  const tokens = Array.from({ length: d.donActive }, () => '<span class="don"></span>').join('')
    + Array.from({ length: d.donRested }, () => '<span class="don rested"></span>').join('');
  return `<div class="don-area" data-pile="don" data-side="${side}" tabindex="0" role="button">
    <div class="don-deck"><b>${d.donDeck}</b><span>Deck DON!!</span></div>
    <div class="don-cost"><div class="tokens">${tokens || '<span class="muted small">Zone de coût</span>'}</div>
    <div class="small"><b>${d.donActive}</b> actif${d.donActive > 1 ? 's' : ''} · ${d.donRested} reposé${d.donRested > 1 ? 's' : ''}</div></div></div>`;
}

function sideHTML(side) {
  const mine = side === 'me';
  const d = mine ? G.me : G.opp;
  if (!d || !d.leader) return `<div class="side ${side} empty"><p class="muted">${mine ? '' : 'En attente de l\'adversaire…'}</p></div>`;
  const n = (x) => (mine ? x.length : x);
  const chars = Array.from({ length: 5 }, (_, i) => (d.chars[i] ? slot(d.chars[i], side, 'chars') : '<div class="slot free"></div>')).join('');
  const base = `<div class="row base">
      ${pile('life', side, n(d.life), 'Vie')}
      <div class="leader-zone">${slot(d.leader, side, 'leader')}</div>
      <div class="stage-zone">${d.stage ? slot(d.stage, side, 'stage') : '<div class="slot free stage-free"><span>Lieu</span></div>'}</div>
      ${pile('deck', side, n(d.deck), 'Deck')}
      ${pile('trash', side, d.trash.length, 'Défausse', d.trash.at(-1) ? { ...(mine ? myCard(d.trash.at(-1)) : oppCard(d.trash.at(-1))), c: d.trash.at(-1).c } : null)}
      ${donArea(side, d)}
    </div>`;
  const field = `<div class="row chars-row">${chars}</div>`;
  const hand = mine
    ? `<div class="row hand" aria-label="Votre main">${d.hand.map((i) => `<div class="hcard" data-u="${i.u}" data-side="me" data-zone="hand" data-cid="${i.c}" tabindex="0">${cardHTML(myCard(i))}</div>`).join('') || '<span class="muted">Main vide</span>'}</div>`
    : `<div class="row ohand"><span class="muted small">Main : ${d.hand}</span>${'<div class="card back mini"><div class="frame"></div></div>'.repeat(d.hand)}</div>`;
  return `<div class="side ${side}">${mine ? field + base + hand : hand + base + field}</div>`;
}

function centerHTML() {
  const t = G.turn;
  const b = G.battle;
  let inner = '';
  if (G.phase === 'hello') inner = `<p>${G.oppHello ? 'Tirage au sort…' : 'Connexion avec l\'adversaire…'}</p>`;
  else if (G.phase === 'choose') {
    inner = G.coinWinner === G.role
      ? `<p><b>Vous avez gagné le tirage au sort !</b> Voulez-vous commencer ?</p>
         <div class="row-btns"><button class="btn primary" data-do="first">Jouer en premier</button><button class="btn" data-do="second">Jouer en second</button></div>`
      : `<p>${esc(G.oppName)} a gagné le tirage et choisit qui commence…</p>`;
  } else if (G.phase === 'mulligan') {
    inner = `<p><b>Votre main de départ.</b> ${G.first === G.role ? 'Vous commencez.' : `${esc(G.oppName)} commence.`} Garder ou refaire (une seule fois) ?</p>
      <div class="row-btns"><button class="btn primary" data-do="keep">Garder</button><button class="btn" data-do="mull">Mulligan</button></div>`;
  } else if (G.phase === 'ready') inner = `<p>En attente de ${esc(G.oppName)}…</p>`;
  else if (G.phase === 'over') {
    const win = G.winner === G.role;
    inner = `<p class="result ${win ? 'win' : 'lose'}">${win ? '🏆 Victoire !' : 'Défaite'}</p>
      <p class="muted small">${win ? `${esc(G.oppName)} a perdu` : 'Vous avez perdu'}${G.overReason ? ` : ${esc(G.overReason)}` : '.'}</p>
      <div class="row-btns"><button class="btn primary" data-do="rematch">Revanche</button><button class="btn ghost" data-do="quit">Quitter</button></div>`;
  } else if (b) {
    const atkSide = b.role === 'atk';
    const atkInst = atkSide ? locate(b.attacker)?.inst : findOpp(b.attacker);
    const tgtInst = atkSide ? findOpp(b.target) : locate(b.target)?.inst;
    const atkC = atkSide ? G.myCards[b.attackerCard] : G.oppCards[b.attackerCard];
    const tgtC = atkSide ? G.oppCards[b.targetCard] : G.myCards[b.targetCard];
    const atkP = b.step === 'attack' && atkInst ? myPower(atkInst) : b.atkPower;
    const defBase = tgtInst ? (atkSide ? oppPower(tgtInst) : myPower(tgtInst)) : 0;
    const def = defBase + (b.counter || 0);
    const vs = `<div class="vs"><div><small>Attaquant</small><b>${esc(atkC?.name)}</b><span class="big">${atkP ?? '?'}</span></div>
      <span class="vs-x">⚔</span>
      <div><small>Cible${b.blocker ? ' (bloqueur)' : ''}</small><b>${esc(tgtC?.name)}</b><span class="big">${def}</span>${b.counter ? `<small>dont Contre +${b.counter}</small>` : ''}</div></div>
      ${b.double || b.banish ? `<p class="small">${b.double ? '<span class="kw">Double attaque</span> ' : ''}${b.banish ? '<span class="kw">Exil</span>' : ''}</p>` : ''}`;
    if (atkSide && b.step === 'attack') {
      inner = `<p class="phase-t">Étape d'attaque</p>${vs}
        <p class="small muted">Résolvez vos effets [Attaque] (menu de vos cartes pour la puissance), puis envoyez l'attaque.</p>
        <label class="small"><input type="checkbox" data-flag="double" ${b.double ? 'checked' : ''}> Double attaque</label>
        <label class="small"><input type="checkbox" data-flag="banish" ${b.banish ? 'checked' : ''}> Exil</label>
        <div class="row-btns"><button class="btn primary" data-do="send-atk">Envoyer l'attaque</button><button class="btn ghost" data-do="cancel-atk">Annuler</button></div>`;
    } else if (atkSide) {
      inner = `<p class="phase-t">Combat</p>${vs}<p class="small muted">${esc(G.oppName)} choisit son Bloqueur et ses Contres…</p>`;
    } else {
      inner = `<p class="phase-t">Vous êtes attaqué !</p>${vs}
        <p class="small muted">Cliquez sur un Personnage <span class="kw">Bloqueur</span> pour bloquer, et sur des cartes de votre main pour Contrer.</p>
        <div class="row-btns"><button class="btn small" data-do="ctr-plus">+1000</button><button class="btn small" data-do="ctr-minus">−1000</button></div>
        <div class="row-btns"><button class="btn primary" data-do="resolve">Valider la défense</button></div>`;
    }
  } else if (G.phase === 'play') {
    const mt = myTurn();
    inner = `<p class="turn ${mt ? 'mine' : ''}">Tour ${t.count} · ${mt ? 'À vous de jouer' : `Tour de ${esc(G.oppName)}`}</p>
      ${G.select?.kind === 'attack' ? '<p class="small hl-t">Choisissez la cible : le Leader adverse ou un Personnage adverse <b>reposé</b>. (Échap pour annuler)</p>' : ''}
      ${mt ? '<div class="row-btns"><button class="btn primary" data-do="end">Fin du tour</button></div>' : ''}`;
  }
  return `<div class="center">${G.disconnected ? '<p class="msg err">Adversaire déconnecté.</p>' : ''}${inner}
    ${G.phase === 'play' ? '<button class="btn ghost small concede" data-do="concede">Abandonner</button>' : ''}</div>`;
}

function findOpp(u) {
  const o = G.opp;
  if (!o) return null;
  if (o.leader?.u === u) return o.leader;
  if (o.stage?.u === u) return o.stage;
  return o.chars.find((x) => x.u === u) || null;
}

function viewerHTML() {
  const v = G.viewer;
  if (!v) return '';
  const mine = v.side === 'me';
  let list = mine ? G.me[v.zone] : G.opp?.[v.zone] || [];
  if (v.zone === 'deck' && v.count) list = list.slice(0, v.count);
  if (v.zone === 'life' || v.zone === 'trash') list = [...list].reverse(); // dessus en premier
  const title = { deck: v.count ? `Les ${v.count} cartes du dessus du deck` : 'Votre deck', trash: mine ? 'Votre défausse' : `Défausse de ${esc(G.oppName)}`, life: 'Votre Vie (dessus en premier)' }[v.zone];
  return `<div class="overlay viewer"><div class="dialog wide" role="dialog" aria-label="${title}">
    <h3>${title} <span class="muted">(${list.length})</span></h3>
    ${mine ? '<p class="small muted">Cliquez sur une carte pour la déplacer. Ordre : la première carte est celle du dessus.</p>' : ''}
    <div class="card-grid">${list.map((i) => `<button class="grid-card" ${mine ? `data-vu="${i.u}"` : ''} data-cid="${i.c}" data-side="${v.side}">${cardHTML(mine ? myCard(i) : oppCard(i))}</button>`).join('') || '<p class="muted">Aucune carte.</p>'}</div>
    <div class="row-btns">${mine && v.zone === 'deck' ? '<button class="btn" data-do="v-shuffle">Mélanger et fermer</button>' : ''}<button class="btn primary" data-do="v-close">Fermer</button></div>
  </div></div>`;
}

function previewHTML() {
  const p = G.preview;
  if (!p) return '<p class="muted small">Survolez une carte pour la voir en grand.</p>';
  const c = p.side === 'opp' ? G.oppCards[p.cid] : G.myCards[p.cid];
  if (!c) return '';
  let extra = '';
  const inst = p.u && (p.side === 'me' ? locate(p.u)?.inst : findOpp(p.u));
  if (inst && (c.type === 'leader' || c.type === 'character')) {
    const ownerTurn = p.side === 'me' ? myTurn() : oppTurn();
    const parts = [`base ${c.power}`];
    if (inst.d) parts.push(`${inst.d} DON!!${ownerTurn ? ` +${inst.d * 1000}` : ' (inactif hors de son tour)'}`);
    if (inst.m) parts.push(`effets ${inst.m > 0 ? '+' : ''}${inst.m}`);
    extra = `<p class="small">Puissance : <b>${power(inst, c, ownerTurn)}</b> (${parts.join(', ')})</p>`;
  }
  return `<div class="big-card">${cardHTML(c)}</div>${extra}
    <div class="pv-text"><b>${esc(c.name)}</b> <span class="muted">${TYPES[c.type]}</span>
    ${c.effect ? `<p>${fmtEffect(c.effect)}</p>` : ''}${c.trigger ? `<p><span class="kw trig">Déclenchement</span> ${fmtEffect(c.trigger)}</p>` : ''}</div>`;
}

function logHTML() {
  return G.log.slice(-200).map((l) => {
    const who = l.who === 'me' ? G.name : l.who === 'opp' ? G.oppName : '';
    return `<li class="lg-${l.who}${l.chat ? ' chat' : ''}">${who ? `<b>${esc(who)}</b> ` : ''}${l.chat ? '💬 ' : ''}${esc(l.text)}</li>`;
  }).join('');
}

function revealsHTML() {
  return G.reveals.map((r) => `<div class="reveal" data-rid="${r.id}"><small>${esc(G.oppName)} · ${esc(r.why || 'révèle')}</small>${cardHTML(G.oppCards[r.c])}<button class="btn small" data-do="r-close" data-rid="${r.id}">OK</button></div>`).join('');
}

function render() {
  if (!G) { renderLobby(); return; }
  const r = root();
  if (!r.querySelector('.game')) {
    r.innerHTML = `<div class="game">
      <div class="board" id="gm-board"></div>
      <aside class="gside">
        <div class="panel preview" id="gm-preview"></div>
        <div class="panel logp"><h3>Journal</h3><ul id="gm-log" class="log"></ul>
          <form id="gm-chat" class="row-btns"><input placeholder="Message…" maxlength="200" aria-label="Message"><button class="btn small">Envoyer</button></form></div>
      </aside>
      <div id="gm-viewer"></div><div id="gm-reveals" class="reveals"></div>
    </div>`;
    bindBoard(r);
  }
  r.querySelector('#gm-board').innerHTML = `
    <div class="names"><span>${esc(G.oppName)}</span></div>
    ${sideHTML('opp')}${centerHTML()}${sideHTML('me')}
    <div class="names"><span>${esc(G.name)} (vous)</span></div>`;
  r.querySelector('#gm-preview').innerHTML = previewHTML();
  const lg = r.querySelector('#gm-log');
  const atBottom = lg.scrollHeight - lg.scrollTop - lg.clientHeight < 40;
  lg.innerHTML = logHTML();
  if (atBottom) lg.scrollTop = lg.scrollHeight;
  r.querySelector('#gm-viewer').innerHTML = viewerHTML();
  r.querySelector('#gm-reveals').innerHTML = revealsHTML();
}

function bindBoard(r) {
  r.addEventListener('click', onBoardClick);
  r.addEventListener('change', (e) => {
    const f = e.target.dataset.flag;
    if (f && G.battle) { G.battle[f] = e.target.checked; render(); }
  });
  r.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-u],[data-pile]')) { e.preventDefault(); onBoardClick(e); }
  });
  r.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-cid]');
    if (!el || !el.dataset.cid) return;
    const p = { cid: el.dataset.cid, side: el.dataset.side || 'me', u: el.dataset.u };
    if (G.preview?.cid === p.cid && G.preview?.u === p.u) return;
    G.preview = p;
    r.querySelector('#gm-preview').innerHTML = previewHTML();
  });
  r.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = e.target.querySelector('input');
    const text = inp.value.trim();
    if (!text) return;
    G.log.push({ who: 'me', text, chat: true });
    send({ t: 'chat', text });
    inp.value = '';
    render();
  });
}

async function onBoardClick(e) {
  const doEl = e.target.closest('[data-do]');
  if (doEl) return doAction(doEl.dataset.do, doEl);
  const vu = e.target.closest('[data-vu]');
  if (vu) {
    const rect = vu.getBoundingClientRect();
    return showMenu(menuForCard(vu.dataset.vu), rect.left + 10, rect.top + 20);
  }
  if (G.phase !== 'play' && G.phase !== 'mulligan') return;
  const el = e.target.closest('[data-u],[data-pile]');
  if (!el) return;
  const { side } = el.dataset;
  const x = e.clientX || el.getBoundingClientRect().left;
  const y = e.clientY || el.getBoundingClientRect().top;
  if (G.phase === 'mulligan') return;
  // sélection d'une cible d'attaque
  if (G.select?.kind === 'attack') {
    if (side === 'opp' && el.dataset.u) {
      const inst = findOpp(el.dataset.u);
      const isLeader = G.opp.leader.u === inst?.u;
      if (inst && (isLeader || (el.dataset.zone === 'chars' && inst.r))) return declareAttack(inst, isLeader);
      return toast('Cible invalide : un Personnage doit être reposé pour être attaqué.');
    }
    G.select = null;
    render();
    return;
  }
  if (side === 'opp') {
    if (el.dataset.pile === 'trash') openViewer('trash', null, 'opp');
    return;
  }
  if (el.dataset.pile) {
    const items = menuForPile(el.dataset.pile);
    if (items) showMenu(items, x, y);
    return;
  }
  showMenu(menuForCard(el.dataset.u), x, y);
}

function doAction(a, el) {
  switch (a) {
    case 'first': return chooseFirst(true);
    case 'second': return chooseFirst(false);
    case 'keep': return finishMulligan(false);
    case 'mull': return finishMulligan(true);
    case 'end': return endTurn();
    case 'send-atk': return sendAttack();
    case 'cancel-atk': return cancelAttack();
    case 'resolve': return resolveBattle();
    case 'ctr-plus': G.battle.counter += 1000; log('ajoute +1000 en défense (effet).'); return battleUpd();
    case 'ctr-minus': G.battle.counter -= 1000; log('retire 1000 en défense (effet).'); return battleUpd();
    case 'concede': if (confirm('Abandonner la partie ?')) lose('Abandon.'); return undefined;
    case 'rematch': send({ t: 'rematch' }); return resetMatch();
    case 'quit':
      link?.close(); link = null; G = null;
      Object.assign(lobby, { status: 'idle', code: '', error: '' });
      return renderLobby();
    case 'v-shuffle': shuffle(G.me.deck); log('mélange son deck.'); G.viewer = null; return commit();
    case 'v-close': G.viewer = null; return render();
    case 'r-close': G.reveals = G.reveals.filter((r) => r.id !== el.dataset.rid); return render();
    default: return undefined;
  }
}
