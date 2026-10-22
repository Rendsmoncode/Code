// Onglet « Jouer » : salon de connexion + plateau de jeu 1v1.
// Chaque joueur gère ses propres cartes (comme sur une vraie table) ; l'adversaire reçoit
// une vue publique (main, deck et vie cachés) après chaque action.
import { S, validateDeck, onChange } from './store.js';
import {
  cardHTML, esc, uid, fmtEffect, TYPES, isBlocker, hasRush, hasDoubleAttack, hasBanish, isUnblockable, attributesOf,
} from './cards.js';
import { WHEN, CONTINUOUS_ACTIONS, effectText, effectsText } from './effects.js';
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
const power = (inst, card, ownerTurn) => (Number(card?.power) || 0) + (inst.m || 0) + (inst.bm || 0) + (inst.pm || 0)
  + (ownerTurn ? (inst.d || 0) * 1000 : 0);
const myPower = (inst) => power(inst, myCard(inst), myTurn()) + staticSum(inst, 'power') + auraSum(inst, 'power');
// L'adversaire envoie la puissance actuelle de ses cartes (p), effets permanents compris.
const oppPower = (inst) => inst.p ?? power(inst, oppCard(inst), oppTurn());
const name = (c) => `« ${c?.name || '?'} »`;

const emptySide = () => ({
  leader: null, life: [], deck: [], hand: [], chars: [], stage: null, trash: [],
  donDeck: 10, donActive: 0, donRested: 0,
});

// ---------- sauvegarde de la partie (reprise après rechargement) ----------
// En ligne : localStorage (survit à la fermeture du navigateur). En mode local (deux onglets du même
// navigateur), sessionStorage, propre à chaque onglet, pour que les deux sauvegardes ne s'écrasent pas.
const SAVE_KEY = 'optcgm-game';
const store = () => (lobby.mode === 'local' ? sessionStorage : localStorage);
function saveGame() {
  if (!G || !lobby.code || ['hello', 'over'].includes(G.phase)) return;
  try {
    const snap = { ...G, preview: null, reveals: [], viewer: null, select: null, log: G.log.slice(-80) };
    store().setItem(SAVE_KEY, JSON.stringify({ at: Date.now(), code: lobby.code, mode: lobby.mode, G: snap }));
  } catch { /* stockage plein ou indisponible : pas de reprise possible */ }
}
function loadSave() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE_KEY) || localStorage.getItem(SAVE_KEY) || 'null');
    return s && Date.now() - s.at < 12 * 3600e3 ? s : null;
  } catch { return null; }
}
function clearSave() {
  try { sessionStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY); } catch { /* rien */ }
}

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
  const saved = lobby.status === 'idle' ? loadSave() : null;
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
      ${saved ? `<div class="box resume"><h3>Partie en cours</h3>
        <p>Contre <b>${esc(saved.G.oppName)}</b> · tour ${saved.G.turn?.count || 0} · code ${esc(saved.code)}</p>
        <div class="row-btns"><button class="btn primary" id="lb-resume">Reprendre la partie</button><button class="btn ghost" id="lb-drop">Abandonner cette partie</button></div></div>` : ''}
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
  r.querySelector('#lb-resume')?.addEventListener('click', () => resumeGame(saved));
  r.querySelector('#lb-drop')?.addEventListener('click', () => { if (confirm('Abandonner définitivement cette partie ?')) { clearSave(); renderLobby(); } });
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

function connect(isHost, code, resumed = null) {
  if (lobby.mode === 'online' && !window.Peer) {
    lobby.error = 'Le module de connexion n\'a pas pu se charger. Vérifiez votre connexion Internet et rechargez la page.';
    renderLobby();
    return;
  }
  if (resumed) G = resumed;
  else {
    const deck = S.decks.find((d) => d.id === lobby.deck);
    if (!deck || !validateDeck(deck).ok) return;
    G = newGame(isHost ? 'host' : 'guest', deck, localStorage.getItem('optcgm-name') || (isHost ? 'Joueur 1' : 'Joueur 2'));
  }
  Object.assign(lobby, { status: resumed ? 'playing' : 'connecting', error: '' });
  if (!isHost) lobby.code = code.trim().toUpperCase();
  if (resumed) render(); else renderLobby();
  let retries = 0;
  const open = () => { link = isHost ? net.host(lobby.mode, h, lobby.code || undefined) : net.join(lobby.mode, lobby.code, h); };
  // Reconnexion automatique (l'invité relance la connexion ; l'hôte attend qu'on revienne vers lui).
  const retry = () => {
    if (!G || G.phase === 'over' || !G.disconnected || retries++ > 40) return;
    link?.close();
    open();
  };
  const h = {
    onReady: (c) => { lobby.code = c; if (!G.connected) { lobby.status = resumed ? 'playing' : 'waiting'; if (resumed) render(); else renderLobby(); } },
    onOpen: () => {
      const again = G.connected;
      G.connected = true;
      G.disconnected = false;
      retries = 0;
      lobby.status = 'playing';
      if (G.phase === 'hello') {
        send({ t: 'hello', name: G.name, cards: G.myCards });
        if (!again) sys('Connecté. Échange des decks…');
      } else {
        send({ t: 'resume', name: G.name, cards: G.myCards, view: pub(), turn: G.turn });
      }
      render();
    },
    onMessage: (m) => { try { onMsg(m); } catch (e) { console.error(e); } },
    onClose: () => {
      if (!G) return;
      G.disconnected = true;
      sys('Connexion avec l\'adversaire perdue : reconnexion automatique…');
      render();
      if (!isHost && lobby.mode === 'online') setTimeout(retry, 3000);
    },
    onError: (t) => {
      // Hôte qui revient : son ancien code peut rester réservé quelques secondes.
      if (isHost && resumed && /déjà utilisé/.test(t) && retries++ < 20) { setTimeout(() => { link?.close(); open(); }, 3000); return; }
      if (!isHost && G?.connected) { setTimeout(retry, 3000); return; }
      if (G?.connected || resumed) { sys(t); render(); return; }
      link?.close(); link = null; G = null;
      Object.assign(lobby, { status: 'idle', error: t });
      renderLobby();
    },
  };
  open();
}

function resumeGame(saved) {
  lobby.mode = saved.mode;
  lobby.code = saved.code;
  const g = saved.G;
  Object.assign(g, { connected: false, disconnected: true, battle: null, manual: null, oppManual: null });
  g.log.push({ who: 'sys', text: 'Partie reprise : reconnexion avec l\'adversaire…' });
  connect(g.role === 'host', saved.code, g);
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
    case 'resume': {
      G.oppName = m.name || G.oppName;
      G.oppCards = m.cards || G.oppCards;
      G.opp = m.view;
      if ((m.turn?.count || 0) > (G.turn?.count || 0)) G.turn = m.turn;
      // Un combat interrompu par la coupure est annulé des deux côtés.
      if (G.battle) { G.battle = null; endBattleMods(); }
      G.select = null;
      G.disconnected = false;
      sys(`${G.oppName} est de retour : la partie reprend.`);
      break;
    }
    case 'hello':
      if (G.phase !== 'hello') { sys('Votre adversaire a relancé une nouvelle partie de son côté : la partie en cours ne peut pas reprendre.'); break; }
      G.oppName = m.name || 'Adversaire';
      G.oppCards = m.cards || {};
      G.oppHello = true;
      sys(`${G.oppName} a rejoint la partie.`);
      if (G.role === 'host') coinFlip();
      break;
    case 'coin': applyCoin(m.winner); break;
    case 'first': applyFirst(m.first); break;
    case 'view': {
      // Si ses effets permanents sur mes cartes changent, ma puissance change : je renvoie ma vue.
      const changed = JSON.stringify(G.opp?.auras || []) !== JSON.stringify(m.v.auras || []);
      G.opp = m.v;
      if (changed && G.phase === 'play') { commit(); return; }
      break;
    }
    case 'ready': G.oppReady = true; maybeStart(); break;
    case 'turn': G.turn = { player: m.player, count: m.count }; break;
    case 'endTurn': oppTurnEnded(m.count); return;
    case 'log': G.log.push({ who: 'opp', text: m.text, manual: m.manual }); break;
    case 'fx': applyFx(m); return;
    case 'manual': G.oppManual = m.on ? m.c : null; break;
    case 'contest': contested(); return;
    case 'chat': G.log.push({ who: 'opp', text: m.text, chat: true }); break;
    case 'reveal': G.reveals.push({ id: uid(), c: m.c, why: m.why }); break;
    case 'attack': G.battle = { ...m.b, role: 'def' }; render(); fireAll('onOppAttack'); return;
    case 'battleUpd': if (G.battle) Object.assign(G.battle, m.b); break;
    case 'battleEnd': G.battle = null; G.select = null; endBattleMods(); break;
    case 'gameover': G.phase = 'over'; G.winner = m.winner; G.overReason = m.reason; clearSave(); break;
    case 'rematch': resetMatch(); return;
    default: break;
  }
  render();
}

// manual : action faite à la main (affichée en rouge chez l'adversaire).
function log(text, manual = Boolean(G?.manual)) {
  G.log.push({ who: 'me', text, manual });
  send({ t: 'log', text, manual });
}
function sys(text) { G?.log.push({ who: 'sys', text }); }

function pub() {
  const m = G.me;
  // Puissance et coût actuels calculés ici (l'adversaire ne connaît pas mes effets permanents).
  const deco = (i) => i && { ...i, p: myPower(i), cc: curCost(i, myCard(i)) };
  return {
    leader: deco(m.leader), chars: m.chars.map(deco), stage: m.stage, trash: m.trash, auras: myAuras(),
    hand: m.hand.length, deck: m.deck.length, life: m.life.length,
    donDeck: m.donDeck, donActive: m.donActive, donRested: m.donRested,
    phase: G.phase,
  };
}

function commit() {
  if (G.phase === 'play' && G.me.deck.length === 0) { lose('Son deck est vide.'); return; }
  // Si la puissance de mon attaquant change pendant le combat, l'adversaire doit le savoir.
  const b = G.battle;
  if (b?.role === 'atk' && b.step === 'defense') {
    const atk = locate(b.attacker)?.inst;
    const pw = atk ? myPower(atk) : b.atkPower;
    if (pw !== b.atkPower) { b.atkPower = pw; send({ t: 'battleUpd', b: { atkPower: pw } }); }
  }
  send({ t: 'view', v: pub() });
  saveGame();
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

async function beginTurn(count) {
  const me = G.me;
  G.turn = { player: G.role, count };
  G.battle = null;
  send({ t: 'turn', player: G.role, count });
  const first = count === 1;
  // Phase de rafraîchissement
  let back = 0;
  for (const i of fieldInsts()) {
    back += i.d || 0;
    i.d = 0;
    if (i.frozen) i.frozen = false; else i.r = false; // « ne se redresse pas » : reste reposé ce tour-ci
  }
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
  await fireAll('startOfTurn');
}

// Le tour adverse se termine : ses effets « jusqu'à la fin du tour » sur mes cartes s'arrêtent.
async function oppTurnEnded(count) {
  endTurnMods();
  await fireAll('endOfOppTurn');
  beginTurn(count + 1);
}

async function endTurn() {
  if (G.battle) return toast('Terminez le combat en cours d\'abord.');
  if (G.manual) endManual();
  await fireAll('endOfTurn');
  endTurnMods();
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
  clearSave();
  send({ t: 'gameover', winner: G.winner, reason });
  send({ t: 'view', v: pub() });
  render();
}

function resetMatch() {
  Object.assign(G, {
    phase: 'hello', coinWinner: null, first: null, turn: { player: null, count: 0 }, me: emptySide(), opp: null,
    meReady: false, oppReady: false, battle: null, select: null, winner: null, reveals: [], manual: null, oppManual: null,
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
  if (loc.zone === 'chars' && to !== 'chars') queueLeave(myCard(inst));
  if (loc.zone === 'chars' || loc.zone === 'stage') {
    me.donRested += inst.d || 0; // les DON!! attachés retournent dans la zone de coût, reposés
    for (const k of ['m', 'bm', 'pm', 'cm', 'cmt', 'kw', 'prot', 'frozen', 'noAtk', 'neg', 'used']) delete inst[k];
    Object.assign(inst, { d: 0, r: false });
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
  const cost = free ? 0 : Math.max(0, curCost(loc.inst, c));
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
  const inst = loc.inst;
  if (c.type === 'character') { move(u, 'chars'); log(`joue ${name(c)}${from}${cost ? ` (coût ${cost})` : ''}.`); }
  else if (c.type === 'stage') { move(u, 'stage'); log(`joue le Lieu ${name(c)}${from}${cost ? ` (coût ${cost})` : ''}.`); }
  else if (c.type === 'event') {
    move(u, 'trash');
    reveal(inst, 'Événement activé');
    log(`active l'Événement ${name(c)}${cost ? ` (coût ${cost})` : ''}.`);
  }
  commit();
  if (c.type === 'event') await fireCard(inst, 'main');
  else {
    await fireCard(inst, 'onPlay');
    if (c.type === 'character') await fireAll('onPlayChar', inst.u, c);
  }
  if (hasFreeText(c) && String(c.effect || '').trim() && !G.manual) {
    const go = await ask('Effet en texte libre', `<div class="ask-card">${cardHTML(c)}</div><p>Cette carte a un effet que le jeu ne fait pas automatiquement. Le résoudre à la main maintenant ?</p>`,
      [{ label: 'Résoudre à la main', value: true, cls: 'primary' }, { label: 'Non', value: false, cls: 'ghost' }]);
    if (go) startManual(inst);
  }
}

const zoneName = (z) => ({
  hand: 'la main', chars: 'le terrain', trash: 'la défausse', life: 'la Vie', deck: 'le deck', stage: 'le terrain',
}[z] || z);

// ---------- combat ----------
function startAttack(inst) {
  if (G.turn.count <= 2) return toast('Personne ne peut attaquer pendant son premier tour.');
  const c = myCard(inst);
  if ((inst.noAtk || 0) >= G.turn.count) return toast(`${c.name} ne peut pas attaquer ce tour-ci.`);
  if (c.type === 'character' && inst.t === G.turn.count && !hasKw(inst, 'rush')) {
    return toast(`${c.name} a été joué ce tour : il lui faut [Initiative] pour attaquer.`);
  }
  G.select = { kind: 'attack', attacker: inst.u };
  render();
}

async function declareAttack(targetInst, isLeader) {
  const atk = locate(G.select.attacker)?.inst;
  G.select = null;
  if (!atk) return;
  const c = myCard(atk);
  atk.r = true;
  G.battle = {
    role: 'atk', step: 'attack', attacker: atk.u, attackerCard: atk.c, target: targetInst.u, targetCard: targetInst.c,
    targetIsLeader: isLeader, counter: 0, blocker: null, double: hasKw(atk, 'double'), banish: hasKw(atk, 'banish'),
    noBlock: hasKw(atk, 'unblockable'),
  };
  log(`attaque ${name(oppCard(targetInst))} avec ${name(c)}.`);
  commit();
  await fireCard(atk, 'onAttack');
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
  endBattleMods();
  log('annule son attaque.');
  commit();
}

function battleUpd() {
  const { counter, blocker, target, targetCard, targetIsLeader } = G.battle;
  send({ t: 'battleUpd', b: { counter, blocker, target, targetCard, targetIsLeader } });
  commit();
}

async function block(inst) {
  const c = myCard(inst);
  if (G.battle.noBlock) return toast('Cette attaque ne peut pas être bloquée.');
  if (!hasKw(inst, 'blocker')) return toast(`${c.name} n'a pas [Bloqueur].`);
  inst.r = true;
  Object.assign(G.battle, { blocker: inst.u, target: inst.u, targetCard: inst.c, targetIsLeader: false });
  log(`bloque avec ${name(c)}.`);
  battleUpd();
  await fireCard(inst, 'onBlock');
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
  const cost = Math.max(0, curCost(inst, c));
  if (cost > G.me.donActive) return toast(`Pas assez de DON!! actifs : il en faut ${cost}.`);
  if (hasEffect(inst, 'counter')) {
    G.me.donActive -= cost;
    G.me.donRested += cost;
    move(inst.u, 'trash');
    reveal(inst, 'Événement [Contre]');
    log(`active ${name(c)} en Contre.`);
    commit();
    await fireCard(inst, 'counter');
    if (G.battle) battleUpd();
    return;
  }
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
      } else if (isProtected(tgt, 'battle')) {
        log(`${name(tc)} ne peut pas être mis KO en combat (${b.atkPower} contre ${def}).`);
      } else {
        await koMine(tgt, ` (${b.atkPower} contre ${def})`);
      }
    } else log(`repousse l'attaque (${b.atkPower} contre ${def}).`);
  } else log('constate que l\'attaque n\'a plus de cible.');
  G.battle = null;
  endBattleMods();
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
      await fireAll('onLifeLost');
      continue;
    }
    if (c.trigger || hasEffect(inst, 'trigger')) {
      commit();
      const choice = await ask('Déclenchement !', `<div class="ask-card">${cardHTML(c)}</div><p>Cette carte Vie a un effet <b>Déclenchement</b>.</p>`, [
        { label: 'Activer le Déclenchement', value: 'trig', cls: 'primary' },
        { label: 'Ajouter à la main', value: 'hand' },
      ]);
      if (choice === 'trig' && hasEffect(inst, 'trigger')) {
        reveal(inst, 'Déclenchement');
        log(`révèle ${name(c)} et active son Déclenchement.`);
        me.hand.push(inst); // la carte attend en main pendant son effet
        const ctx = await fireCard(inst, 'trigger');
        if (ctx?.played && locate(inst.u)?.zone === 'hand') await playCard(inst.u, true);
        else if (locate(inst.u)?.zone === 'hand') move(inst.u, 'trash');
        await fireAll('onLifeLost');
        continue;
      }
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
    await fireAll('onLifeLost');
  }
  return false;
}

// ---------- effets automatiques ----------
// Modificateurs portés par une carte en jeu (inst) :
//   m / bm / pm : puissance (tour / combat / permanent) ; cmt / cm : coût (tour / permanent)
//   kw : { motClé: durée } ; prot : { battle|effect: durée } ; frozen ; noAtk (n° de tour) ; neg ; used
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hasNum = (v) => v !== undefined && v !== '' && v !== null;
const curCost = (inst, c) => (Number(c?.cost) || 0) + (inst?.cm || 0) + (inst?.cmt || 0)
  + (inst?.u ? staticSum(inst, 'cost') + auraSum(inst, 'cost') : 0);
const effectsOf = (inst) => (inst?.neg ? [] : myCard(inst)?.effects || []);
const donTotal = () => G.me.donActive + G.me.donRested + fieldInsts().reduce((s, i) => s + (i.d || 0), 0);

function condOK(c, src) {
  const me = G.me;
  const L = myCard(me.leader);
  switch (c.k) {
    case 'donAttached': return (src?.d || 0) >= c.n;
    case 'donField': return donTotal() >= c.n;
    case 'leaderType': return norm(L.traits).includes(norm(c.v));
    case 'leaderColor': return (L.colors || []).includes(c.v);
    case 'leaderAttr': return attributesOf(L).map(norm).includes(norm(c.v));
    case 'lifeLE': return me.life.length <= c.n;
    case 'lifeGE': return me.life.length >= c.n;
    case 'oppLifeLE': return (G.opp?.life ?? 99) <= c.n;
    case 'handLE': return me.hand.length <= c.n;
    case 'charsGE': return me.chars.filter((i) => !c.type || norm(myCard(i).traits).includes(norm(c.type))).length >= c.n;
    case 'trashGE': return me.trash.length >= c.n;
    case 'myTurn': return myTurn();
    case 'oppTurn': return oppTurn();
    default: return true;
  }
}
const condsOK = (e, src) => (e.conds || []).every((c) => condOK(c, src));

// Une carte correspond-elle au filtre ? side : 'me' ou 'opp' (pour la puissance / le coût actuels).
function matches(c, f = {}, inst = null, side = 'me') {
  if (!c) return false;
  if (f.type && !norm(c.traits).includes(norm(f.type))) return false;
  if (f.color && !(c.colors || []).includes(f.color)) return false;
  if (f.attr && !attributesOf(c).map(norm).includes(norm(f.attr))) return false;
  if (f.name && !norm(c.name).includes(norm(f.name))) return false;
  if (f.cardType && c.type !== f.cardType) return false;
  const cost = inst ? (side === 'opp' ? (inst.cc ?? curCost(inst, c)) : curCost(inst, c)) : Number(c.cost) || 0;
  if (hasNum(f.maxCost) && cost > f.maxCost) return false;
  if (hasNum(f.minCost) && cost < f.minCost) return false;
  if (hasNum(f.maxPower)) {
    const pw = inst ? (side === 'opp' ? oppPower(inst) : myPower(inst)) : Number(c.power) || 0;
    if (pw > f.maxPower) return false;
  }
  if (hasNum(f.maxBasePower) && (Number(c.power) || 0) > f.maxBasePower) return false;
  if (f.rested === 'yes' && !inst?.r) return false;
  if (f.rested === 'no' && inst?.r) return false;
  return true;
}

// Cartes visées possibles (sans choix du joueur).
function candidates(t, src) {
  if (t.who === 'self') return src ? [src] : [];
  const opp = t.side === 'opp';
  const S = opp ? G.opp : G.me;
  if (!S) return [];
  const getC = opp ? oppCard : myCard;
  const out = [];
  if (['leader', 'leaderOrChar', 'leaderAndAll'].includes(t.who) && S.leader) out.push(S.leader);
  if (t.who !== 'leader') out.push(...S.chars.filter((i) => matches(getC(i), t.f, i, opp ? 'opp' : 'me')));
  return out;
}

async function chooseTargets(t, src, title) {
  const list = candidates(t, src);
  if (['self', 'leader', 'allChars', 'leaderAndAll'].includes(t.who)) return list;
  if (!list.length) return [];
  return (await pickMany(title, list, t.side === 'opp' ? oppCard : myCard, { max: t.n || 1 })) || [];
}

// ---------- mots-clés et effets permanents ----------
function staticEffects() {
  const out = [];
  for (const src of fieldInsts()) {
    for (const e of effectsOf(src)) {
      const w = WHEN[e.when];
      if (!w?.continuous) continue;
      if (e.when === 'yourTurn' && !myTurn()) continue;
      if (e.when === 'oppTurn' && !oppTurn()) continue;
      if (!condsOK(e, src)) continue;
      out.push({ src, e });
    }
  }
  return out;
}
function staticTargets(a, src) {
  const t = { ...(a.t || {}), side: 'mine' };
  if (a.t?.side === 'opp') return [];
  if (t.who === 'self') return [src];
  if (t.who === 'leader') return [G.me.leader];
  const chars = G.me.chars.filter((i) => matches(myCard(i), t.f, i, 'me'));
  return ['leaderOrChar', 'leaderAndAll'].includes(t.who) ? [G.me.leader, ...chars] : chars;
}
let inStatic = false; // évite les boucles (un filtre de puissance qui dépend d'un effet permanent)
function staticSum(inst, kind) {
  if (inStatic || !G?.me?.leader) return 0;
  inStatic = true;
  let s = 0;
  try {
    for (const { src, e } of staticEffects()) {
      for (const a of e.actions || []) {
        if (a.k !== kind) continue;
        if (staticTargets(a, src).some((x) => x?.u === inst.u)) s += Number(a.amount) || 0;
      }
    }
  } finally { inStatic = false; }
  return s;
}
function staticFlag(inst, kind, test) {
  if (inStatic || !G?.me?.leader) return false;
  inStatic = true;
  try {
    return staticEffects().some(({ src, e }) => (e.actions || []).some((a) => a.k === kind && test(a)
      && staticTargets(a, src).some((x) => x?.u === inst.u)));
  } finally { inStatic = false; }
}
// Effets permanents de l'ADVERSAIRE qui visent mes cartes (« auras ») : il me les envoie avec sa vue.
function myAuras() {
  if (!G?.me?.leader) return [];
  const out = [];
  for (const { e } of staticEffects()) {
    for (const a of e.actions || []) {
      if (a.t?.side !== 'opp' || !CONTINUOUS_ACTIONS.includes(a.k)) continue;
      out.push({ k: a.k, amount: Number(a.amount) || 0, kw: a.kw, by: a.by, who: a.t.who, f: a.t.f || {} });
    }
  }
  return out;
}
function auraHits(a, inst) {
  const isLeader = G.me.leader?.u === inst.u;
  const isChar = G.me.chars.some((x) => x.u === inst.u);
  if (a.who === 'leader') return isLeader;
  if (isLeader) return ['leaderOrChar', 'leaderAndAll'].includes(a.who);
  return isChar && a.who !== 'self' && matches(myCard(inst), a.f, inst, 'me');
}
function auraSum(inst, kind) {
  if (inStatic || !G?.opp?.auras?.length) return 0;
  inStatic = true;
  try {
    return G.opp.auras.filter((a) => a.k === kind && auraHits(a, inst)).reduce((s, a) => s + a.amount, 0);
  } finally { inStatic = false; }
}
function auraFlag(inst, kind, test) {
  if (inStatic || !G?.opp?.auras?.length) return false;
  inStatic = true;
  try { return G.opp.auras.some((a) => a.k === kind && test(a) && auraHits(a, inst)); } finally { inStatic = false; }
}

// Mot-clé d'une de mes cartes en jeu (carte, effet temporaire, effet permanent, ou aura adverse).
function hasKw(inst, k) {
  const c = myCard(inst);
  if (!inst.neg && ({ blocker: isBlocker, rush: hasRush, double: hasDoubleAttack, banish: hasBanish, unblockable: isUnblockable }[k])?.(c)) return true;
  if (inst.kw?.[k]) return true;
  return staticFlag(inst, 'grantKw', (a) => a.kw === k) || auraFlag(inst, 'grantKw', (a) => a.kw === k);
}
function isProtected(inst, kind) {
  if (inst.prot?.[kind] || inst.prot?.both) return true;
  const test = (a) => a.by === kind || a.by === 'both';
  return staticFlag(inst, 'protect', test) || auraFlag(inst, 'protect', test);
}

// Applique un modificateur à une de MES cartes (effet de moi ou reçu de l'adversaire).
function applyMod(inst, a) {
  const dur = a.dur || 'turn';
  if (a.k === 'power') {
    const key = dur === 'battle' ? 'bm' : dur === 'perm' ? 'pm' : 'm';
    inst[key] = (inst[key] || 0) + (Number(a.amount) || 0);
  } else if (a.k === 'cost') {
    const key = dur === 'perm' ? 'cm' : 'cmt';
    inst[key] = (inst[key] || 0) + (Number(a.amount) || 0);
  } else if (a.k === 'grantKw') {
    inst.kw = { ...(inst.kw || {}), [a.kw]: dur };
  } else if (a.k === 'protect') {
    inst.prot = { ...(inst.prot || {}), [a.by || 'both']: dur };
  } else if (a.k === 'rest') inst.r = true;
  else if (a.k === 'untap') inst.r = false;
  else if (a.k === 'freeze') inst.frozen = true;
  else if (a.k === 'cannotAttack') inst.noAtk = G.turn.count + 1;
  else if (a.k === 'negate') inst.neg = true;
}
function clearDur(inst, dur) {
  for (const key of ['kw', 'prot']) {
    if (!inst[key]) continue;
    for (const [k, v] of Object.entries(inst[key])) if (v === dur) delete inst[key][k];
  }
}
// Fin de combat : les bonus « pendant ce combat » disparaissent.
function endBattleMods() {
  for (const i of fieldInsts()) { i.bm = 0; clearDur(i, 'battle'); }
}
// Fin d'un tour (le mien ou celui de l'adversaire) : les effets « jusqu'à la fin du tour » disparaissent.
function endTurnMods() {
  for (const i of fieldInsts()) {
    Object.assign(i, { m: 0, cmt: 0, neg: false });
    clearDur(i, 'turn');
    clearDur(i, 'battle');
    i.bm = 0;
  }
}

// Met KO une de mes cartes en jeu et déclenche ses effets [KO].
async function koMine(inst, why = '') {
  const loc = locate(inst.u);
  if (!loc || !['chars', 'stage'].includes(loc.zone)) return;
  const c = myCard(inst);
  move(inst.u, 'trash');
  log(`voit ${name(c)} mis KO${why}.`);
  await fireCard(inst, 'onKO');
  if (c.type === 'character') await fireAll('onOwnKO', null, c);
}

// « Quand un de vos Personnages quitte le terrain » : move() met les départs en file, résolus dès
// qu'aucun autre effet n'est en cours (pour ne pas ouvrir deux fenêtres de choix à la fois).
let leaveQueue = [];
let leaveTimer = null;
function queueLeave(c) {
  leaveQueue.push(c);
  if (!leaveTimer) leaveTimer = setTimeout(flushLeaves, 0);
}
async function flushLeaves() {
  if (busy > 0 || G?.phase !== 'play') {
    leaveTimer = G?.phase === 'play' ? setTimeout(flushLeaves, 250) : null;
    if (!leaveTimer) leaveQueue = [];
    return;
  }
  leaveTimer = null;
  const list = leaveQueue;
  leaveQueue = [];
  for (const c of list) await fireAll('onOwnLeave', null, c);
}

// ---------- coûts ----------
function canPay(costs, src) {
  const me = G.me;
  for (const c of costs || []) {
    if (c.k === 'restDon' && me.donActive < c.n) return `Il faut ${c.n} DON!! actif(s).`;
    if (c.k === 'donReturn' && donTotal() < c.n) return `Il faut ${c.n} DON!! sur le terrain.`;
    if (c.k === 'discard' && me.hand.length < c.n) return `Il faut ${c.n} carte(s) en main.`;
    if (c.k === 'restSelf' && src?.r) return 'Cette carte est déjà reposée.';
    if (c.k === 'koOwn' && !me.chars.length) return 'Il faut un Personnage à mettre KO.';
    if (c.k === 'trashToDeck' && me.trash.length < c.n) return `Il faut ${c.n} carte(s) en défausse.`;
    if (c.k === 'lifeToHand' && !me.life.length) return 'Il faut une Vie.';
    if (c.k === 'revealHand' && !me.hand.some((i) => matches(myCard(i), c.f || {}))) return 'Aucune carte de votre main ne convient.';
  }
  return '';
}
async function payCosts(costs, src) {
  const me = G.me;
  for (const c of costs || []) {
    if (c.k === 'restDon') { me.donActive -= c.n; me.donRested += c.n; }
    else if (c.k === 'donReturn') {
      let n = c.n;
      const take = (k) => { const x = Math.min(n, me[k]); me[k] -= x; n -= x; };
      take('donActive'); take('donRested');
      for (const i of fieldInsts()) { const x = Math.min(n, i.d || 0); i.d -= x; n -= x; }
      me.donDeck += c.n - n;
    } else if (c.k === 'discard') {
      const picked = await pickMany(`Coût : défaussez ${c.n} carte(s)`, me.hand, myCard, { min: c.n, max: c.n, cancel: false });
      for (const i of picked) move(i.u, 'trash');
    } else if (c.k === 'restSelf') src.r = true;
    else if (c.k === 'koOwn') {
      const [v] = await pickMany('Coût : mettez KO un de vos Personnages', me.chars, myCard, { min: 1, max: 1, cancel: false });
      if (v) await koMine(v, ' (coût)');
    } else if (c.k === 'trashToDeck') {
      const picked = await pickMany(`Coût : ${c.n} carte(s) de la défausse sous le deck`, me.trash, myCard, { min: c.n, max: c.n, cancel: false });
      for (const i of picked) move(i.u, 'deck', 'bottom');
    } else if (c.k === 'lifeToHand') { const i = me.life.at(-1); if (i) move(i.u, 'hand'); }
    else if (c.k === 'revealHand') {
      const ok = (i) => matches(myCard(i), c.f || {});
      const [i] = await pickMany('Coût : révélez une carte de votre main', me.hand, myCard, { min: 1, max: 1, selectable: ok, cancel: false });
      if (i) { reveal(i, 'Révélée (coût)'); log(`révèle ${name(myCard(i))}.`); }
    }
  }
}

// ---------- exécution ----------
// ctx : { src, eff, played (Déclenchement : la carte a été jouée) }
async function runEffect(src, eff, opts = {}) {
  busy++;
  try { return await runEffectNow(src, eff, opts); } finally { busy--; }
}
let busy = 0; // nombre d'effets en cours de résolution (les déclenchements en attente patientent)
async function runEffectNow(src, eff, { optional = false, idx = 0 } = {}) {
  const c = myCard(src);
  if (!condsOK(eff, src)) return false;
  const usedKey = `${src.c}:${idx}`;
  if (eff.once && src.used?.[usedKey] === G.turn.count) { toast('Cet effet a déjà été utilisé ce tour.'); return false; }
  const why = canPay(eff.costs, src);
  if (why) { if (!optional) toast(why); return false; }
  const txt = effectText(eff);
  if (optional || (eff.costs || []).length) {
    const go = await ask(`Effet de ${c.name}`, `<div class="ask-card">${cardHTML(c)}</div><p class="fx-ask">${fmtEffect(txt)}</p><p>Activer cet effet ?</p>`,
      [{ label: 'Activer', value: true, cls: 'primary' }, { label: 'Ne pas activer', value: false, cls: 'ghost' }]);
    if (!go) return false;
  }
  await payCosts(eff.costs, src);
  src.used = { ...(src.used || {}), [usedKey]: G.turn.count };
  log(`active l'effet de ${name(c)} : ${txt}`);
  const ctx = { src, eff };
  for (const a of eff.actions || []) {
    try { await doFx(a, ctx); } catch (err) { console.error(err); }
  }
  commit();
  return ctx;
}

// Effets d'une carte pour un déclencheur donné.
async function fireCard(inst, when, opts = {}) {
  const list = effectsOf(inst);
  let ctx = null;
  const { subject, ...rest } = opts;
  opts = rest;
  for (let idx = 0; idx < list.length; idx++) {
    if (list[idx].when !== when) continue;
    if (WHEN[when]?.subject && subject && !matches(subject, list[idx].wf || {})) continue;
    ctx = (await runEffect(inst, list[idx], { ...opts, idx })) || ctx;
  }
  return ctx;
}
// Effets de toutes mes cartes en jeu pour un déclencheur donné.
// subject : carte concernée par le déclencheur (Personnage KO, joué, qui quitte le terrain), filtrée par e.wf.
async function fireAll(when, except = null, subject = null) {
  for (const inst of fieldInsts()) {
    if (inst.u === except) continue;
    if (effectsOf(inst).some((e) => e.when === when)) await fireCard(inst, when, { subject });
  }
}
const hasEffect = (inst, when) => effectsOf(inst).some((e) => e.when === when);

// Envoie une action qui touche les cartes de l'adversaire : c'est son navigateur qui l'applique.
function sendFx(op, data, src) {
  send({ t: 'fx', op, by: myCard(src)?.name || '', ...data });
}

async function doFx(a, ctx) {
  const me = G.me;
  const { src } = ctx;
  const srcName = myCard(src)?.name || '';
  const t = a.t || {};
  const opp = t.side === 'opp';
  const title = (verb) => `${srcName} : ${verb}`;
  switch (a.k) {
    case 'draw': {
      for (let i = 0; i < a.n && me.deck.length; i++) me.hand.push(me.deck.shift());
      log(`pioche ${a.n} carte(s).`);
      break;
    }
    case 'discard': {
      const n = Math.min(a.n, me.hand.length);
      const picked = a.random === 'yes' ? shuffle([...me.hand]).slice(0, n)
        : await pickMany(title(`défaussez ${n} carte(s)`), me.hand, myCard, { min: n, max: n, cancel: false });
      for (const i of picked) { move(i.u, 'trash'); reveal(i, 'Défaussée'); }
      log(`défausse ${picked.map((i) => name(myCard(i))).join(', ')}.`);
      break;
    }
    case 'oppDiscard': sendFx('discard', { n: a.n }, src); break;
    case 'look': {
      const top = me.deck.slice(0, a.n);
      const ok = (i) => matches(myCard(i), a.f || {});
      const picked = (await pickMany(title(`prenez jusqu'à ${a.take} carte(s)`), top, myCard, { max: a.take, selectable: ok })) || [];
      for (const i of picked) { move(i.u, 'hand'); reveal(i, 'Ajoutée à la main'); }
      for (const i of top.filter((x) => !picked.includes(x))) move(i.u, a.rest === 'trash' ? 'trash' : 'deck', 'bottom');
      log(`regarde ${top.length} carte(s) du dessus de son deck${picked.length ? ` et prend ${picked.map((i) => name(myCard(i))).join(', ')}` : ''}.`);
      break;
    }
    case 'search': {
      const list = me.deck.filter((i) => matches(myCard(i), a.f || {}));
      const [i] = (await pickMany(title('choisissez une carte de votre deck'), list, myCard, { max: 1 })) || [];
      if (i) { move(i.u, 'hand'); reveal(i, 'Ajoutée depuis le deck'); }
      shuffle(me.deck);
      log(`cherche dans son deck${i ? ` et prend ${name(myCard(i))}` : ''}, puis le mélange.`);
      break;
    }
    case 'mill': {
      const top = me.deck.slice(0, a.n);
      for (const i of top) move(i.u, 'trash');
      log(`place ${top.length} carte(s) du dessus de son deck dans sa défausse.`);
      break;
    }
    case 'playFree': {
      const zone = a.from || 'hand';
      const list = me[zone].filter((i) => ['character', 'stage'].includes(myCard(i).type)
        && (!hasNum(a.max) || curCost(i, myCard(i)) <= a.max) && matches(myCard(i), a.f || {}));
      const [i] = (await pickMany(title('jouez une carte gratuitement'), list, myCard, { max: 1 })) || [];
      if (i) await playCard(i.u, true);
      break;
    }
    case 'ko': case 'bounce': case 'toBottom': case 'rest': case 'untap': case 'freeze':
    case 'power': case 'cost': case 'grantKw': case 'protect': case 'cannotAttack': case 'negate': {
      const verbs = { ko: 'mettre KO', bounce: 'renvoyer en main', toBottom: 'placer sous le deck', rest: 'reposer', untap: 'redresser', freeze: 'bloquer', power: 'modifier la puissance', cost: 'modifier le coût', grantKw: 'donner un mot-clé', protect: 'protéger', cannotAttack: 'empêcher d\'attaquer', negate: 'annuler les effets' };
      const targets = await chooseTargets(t, src, title(`choisissez la cible (${verbs[a.k]})`));
      if (!targets.length) break;
      if (opp) {
        sendFx(a.k, { us: targets.map((x) => x.u), amount: a.amount, dur: a.dur, kw: a.kw, by2: a.by }, src);
        log(`cible ${targets.map((x) => name(oppCard(x))).join(', ')} (${verbs[a.k]}).`);
        break;
      }
      for (const x of targets) {
        if (a.k === 'ko') {
          if (isProtected(x, 'effect')) { log(`${name(myCard(x))} ne peut pas être mis KO.`); continue; }
          await koMine(x);
        } else if (a.k === 'bounce') { move(x.u, 'hand'); log(`renvoie ${name(myCard(x))} en main.`); }
        else if (a.k === 'toBottom') { move(x.u, 'deck', 'bottom'); log(`place ${name(myCard(x))} sous son deck.`); }
        else applyMod(x, a);
      }
      break;
    }
    case 'playSelf': ctx.played = true; break;
    case 'donAdd': {
      const n = Math.min(a.n, me.donDeck);
      me.donDeck -= n;
      if (a.state === 'active') me.donActive += n; else me.donRested += n;
      log(`ajoute ${n} DON!! ${a.state === 'active' ? 'actif(s)' : 'reposé(s)'}.`);
      break;
    }
    case 'donAttach': {
      const [x] = await chooseTargets({ ...t, n: 1 }, src, title('à qui attacher les DON!!'));
      if (!x) break;
      const n = Math.min(a.n, me.donRested);
      me.donRested -= n;
      x.d = (x.d || 0) + n;
      log(`attache ${n} DON!! reposé(s) à ${name(myCard(x))}.`);
      break;
    }
    case 'donUntap': { const n = Math.min(a.n, me.donRested); me.donRested -= n; me.donActive += n; log(`redresse ${n} DON!!.`); break; }
    case 'donOppReturn': sendFx('donReturn', { n: a.n }, src); break;
    case 'restOppDon': sendFx('restDon', { n: a.n }, src); break;
    case 'lifeFromDeck': {
      for (let k = 0; k < a.n && me.deck.length; k++) move(me.deck[0].u, 'life', 'top');
      log(`ajoute ${a.n} carte(s) du deck à sa Vie.`);
      break;
    }
    case 'lifeFromHand': {
      const picked = (await pickMany(title(`ajoutez jusqu'à ${a.n} carte(s) à votre Vie`), me.hand, myCard, { max: a.n })) || [];
      for (const i of picked) move(i.u, 'life', 'top');
      if (picked.length) log(`ajoute ${picked.length} carte(s) de sa main à sa Vie.`);
      break;
    }
    case 'lifeToHand': {
      for (let k = 0; k < a.n && me.life.length; k++) move(me.life.at(-1).u, 'hand');
      log(`ajoute ${a.n} de ses Vies à sa main.`);
      break;
    }
    case 'oppLifeRemove': sendFx('lifeRemove', { n: a.n, to: a.to }, src); break;
    case 'lifeLook': {
      if (me.life.length < 2) break;
      const top = [...me.life].reverse(); // dessus en premier
      const order = await orderCards('Vos Vies : remettez-les dans l\'ordre (la première est le dessus)', top, myCard);
      me.life = order.reverse();
      log('regarde ses Vies et les réordonne.');
      break;
    }
    case 'redirect': {
      const b = G.battle;
      if (b?.role !== 'def') break;
      const list = [G.me.leader, ...G.me.chars].filter((i) => i.u !== b.target);
      const [x] = (await pickMany(title('nouvelle cible de l\'attaque'), list, myCard, { max: 1 })) || [];
      if (x) {
        Object.assign(b, { target: x.u, targetCard: x.c, targetIsLeader: x.u === G.me.leader.u });
        log(`change la cible de l'attaque : ${name(myCard(x))}.`);
        battleUpd();
      }
      break;
    }
    case 'noBlockers': if (G.battle?.role === 'atk') G.battle.noBlock = true; break;
    default: break;
  }
  commit();
}

// Action reçue de l'adversaire sur mes cartes.
async function applyFx(m) {
  busy++;
  try { await applyFxNow(m); } finally { busy--; }
}
async function applyFxNow(m) {
  const me = G.me;
  const by = m.by ? ` (effet de « ${m.by} »)` : '';
  const insts = (m.us || []).map((u) => locate(u)?.inst).filter(Boolean);
  switch (m.op) {
    case 'ko':
      for (const x of insts) {
        if (isProtected(x, 'effect')) { log(`${name(myCard(x))} ne peut pas être mis KO${by}.`); continue; }
        await koMine(x, by);
      }
      break;
    case 'bounce': for (const x of insts) { move(x.u, 'hand'); log(`reprend ${name(myCard(x))} en main${by}.`); } break;
    case 'toBottom': for (const x of insts) { move(x.u, 'deck', 'bottom'); log(`place ${name(myCard(x))} sous son deck${by}.`); } break;
    case 'rest': case 'untap': case 'freeze': case 'power': case 'cost': case 'grantKw': case 'protect': case 'cannotAttack': case 'negate':
      for (const x of insts) applyMod(x, { k: m.op, amount: m.amount, dur: m.dur, kw: m.kw, by: m.by2 });
      break;
    case 'discard': {
      const n = Math.min(m.n, me.hand.length);
      if (!n) break;
      const picked = await pickMany(`Votre adversaire vous fait défausser ${n} carte(s)${by}`, me.hand, myCard, { min: n, max: n, cancel: false });
      for (const i of picked) { move(i.u, 'trash'); reveal(i, 'Défaussée'); }
      log(`défausse ${picked.map((i) => name(myCard(i))).join(', ')}${by}.`);
      break;
    }
    case 'donReturn': {
      let n = m.n;
      const take = (k) => { const x = Math.min(n, me[k]); me[k] -= x; me.donDeck += x; n -= x; };
      take('donActive'); take('donRested');
      log(`renvoie ${m.n - n} DON!! dans son deck DON!!${by}.`);
      break;
    }
    case 'restDon': { const x = Math.min(m.n, me.donActive); me.donActive -= x; me.donRested += x; log(`voit ${x} DON!! reposé(s)${by}.`); break; }
    case 'lifeRemove': {
      for (let k = 0; k < m.n && me.life.length; k++) {
        const i = me.life.pop();
        me[m.to === 'hand' ? 'hand' : 'trash'].push(i);
      }
      log(`perd ${m.n} Vie(s) vers sa ${m.to === 'hand' ? 'main' : 'défausse'}${by}.`);
      break;
    }
    default: break;
  }
  commit();
}

// ---------- mode manuel (effets en texte libre) ----------
const hasFreeText = (c) => Boolean(String(c?.effect || '').trim() || String(c?.trigger || '').trim());
function startManual(inst) {
  const c = myCard(inst);
  G.manual = { c: inst.c, snapshot: structuredClone(G.me) };
  reveal(inst, 'Effet résolu à la main');
  log(`résout à la main l'effet de ${name(c)} : « ${[c.effect, c.trigger].filter(Boolean).join(' / ')} »`, true);
  send({ t: 'manual', on: true, c: inst.c });
  commit();
}
function endManual() {
  if (!G.manual) return;
  G.manual = null;
  log('termine la résolution manuelle.', true);
  send({ t: 'manual', on: false });
  commit();
}
// L'adversaire conteste : on revient à l'état d'avant le mode manuel.
function contested() {
  if (!G.manual) return;
  G.me = G.manual.snapshot;
  G.manual = null;
  log('annule sa résolution manuelle (contestée par l\'adversaire).', true);
  send({ t: 'manual', on: false });
  commit();
}
async function chooseManualCard() {
  const me = G.me;
  const list = [me.leader, ...me.chars, me.stage, ...me.trash.slice(-3)].filter((i) => i && hasFreeText(myCard(i)));
  if (!list.length) return toast('Aucune de vos cartes visibles n\'a d\'effet en texte libre.');
  const [i] = (await pickMany('Quelle carte a un effet à résoudre à la main ?', list, myCard, { max: 1 })) || [];
  if (i) startManual(i);
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
  // Actions libres : seulement pendant la résolution manuelle d'un effet en texte libre.
  const man = (label, fn, opt = {}) => { if (G.manual) act(`✋ ${label}`, fn, opt); };
  const done = (msg) => () => { if (msg) log(msg); commit(); };
  const playable = c.type !== 'leader';
  const field = ['leader', 'chars', 'stage'].includes(zone);

  if (field && myTurn() && !b && G.phase === 'play') {
    effectsOf(inst).forEach((e, idx) => {
      if (e.when !== 'activateMain') return;
      const txt = effectText(e);
      act(`✨ ${txt.length > 70 ? `${txt.slice(0, 70)}…` : txt}`, () => runEffect(inst, e, { idx }), { cls: 'hl' });
    });
  }
  if (field && hasFreeText(c) && !G.manual && (myTurn() || defending)) {
    act('✋ Résoudre son effet à la main', () => startManual(inst));
  }

  if (zone === 'hand') {
    if (defending && c.type === 'character' && Number(c.counter) > 0) act(`🛡 Contre +${c.counter}`, () => counterChar(inst), { cls: 'hl' });
    if (defending && c.type === 'event') act('🛡 Jouer en Contre (Événement)', () => counterEvent(inst), { cls: 'hl' });
    const counterOnly = c.type === 'event' && hasEffect(inst, 'counter') && !hasEffect(inst, 'main') && !String(c.effect || '').trim();
    if (myTurn() && !b && c.type !== 'leader' && !counterOnly) act(`▶ Jouer (coût ${Math.max(0, curCost(inst, c))})`, () => playCard(u), { cls: 'hl' });
    act('Révéler à l\'adversaire', () => { reveal(inst, 'Carte révélée'); log(`révèle ${name(c)}.`); commit(); });
    man('Jouer sans payer le coût', () => playCard(u, true));
    man('Défausser', () => { move(u, 'trash'); done(`défausse ${name(c)} de sa main.`)(); });
    man('Placer sur le dessus du deck', () => { move(u, 'deck', 'top'); done('place une carte de sa main sur son deck.')(); });
    man('Placer sous le deck', () => { move(u, 'deck', 'bottom'); done('place une carte de sa main sous son deck.')(); });
    man('Ajouter sur la Vie (face cachée)', () => { move(u, 'life', 'top'); done('ajoute une carte de sa main à sa Vie.')(); });
  } else if (zone === 'leader' || zone === 'chars' || zone === 'stage') {
    if (zone !== 'stage' && myTurn() && !b && !inst.r) act('⚔ Attaquer', () => startAttack(inst), { cls: 'hl' });
    if (defending && zone === 'chars' && !inst.r && !b.blocker && !b.noBlock && b.target !== inst.u && hasKw(inst, 'blocker')) {
      act('🛡 Bloquer', () => block(inst), { cls: 'hl' });
    }
    if (zone !== 'stage' && myTurn() && !b) {
      act(`Attacher 1 DON!! (${G.me.donActive} actif${G.me.donActive > 1 ? 's' : ''})`, () => {
        G.me.donActive--; inst.d = (inst.d || 0) + 1; done(`attache 1 DON!! à ${name(c)}.`)();
      }, { disabled: !G.me.donActive });
    }
    man(inst.r ? 'Redresser (actif)' : 'Reposer', () => { inst.r = !inst.r; done(`${inst.r ? 'repose' : 'redresse'} ${name(c)}.`)(); });
    if (zone !== 'stage') {
      if (inst.d) {
        man('Détacher 1 DON!! (→ zone de coût, reposé)', () => { inst.d--; G.me.donRested++; done(`détache 1 DON!! de ${name(c)}.`)(); });
        man('Renvoyer 1 DON!! attaché au deck DON!!', () => { inst.d--; G.me.donDeck++; done(`renvoie 1 DON!! de ${name(c)} au deck DON!!.`)(); });
      }
      man('+1000 puissance (jusqu\'à la fin du tour)', () => { inst.m = (inst.m || 0) + 1000; done(`${name(c)} gagne +1000.`)(); });
      man('−1000 puissance (jusqu\'à la fin du tour)', () => { inst.m = (inst.m || 0) - 1000; done(`${name(c)} perd 1000.`)(); });
    }
    if (zone !== 'leader') {
      man('KO', () => koMine(inst), { sep: true });
      man('Renvoyer en main', () => { move(u, 'hand'); done(`renvoie ${name(c)} en main.`)(); });
      man('Placer sur le dessus du deck', () => { move(u, 'deck', 'top'); done(`place ${name(c)} sur son deck.`)(); });
      man('Placer sous le deck', () => { move(u, 'deck', 'bottom'); done(`place ${name(c)} sous son deck.`)(); });
      man('Ajouter sur la Vie', () => { move(u, 'life', 'top'); done(`ajoute ${name(c)} à sa Vie.`)(); });
    }
  } else {
    // carte vue dans le deck, la défausse ou la Vie
    const src = zoneName(zone);
    const hidden = zone !== 'trash';
    man('Ajouter à la main', () => { move(u, 'hand'); done(hidden ? `ajoute une carte de ${src} à sa main.` : `ajoute ${name(c)} de la défausse à sa main.`)(); }, { cls: 'hl' });
    if (hidden) man('Ajouter à la main en la révélant', () => { reveal(inst, `Ajoutée depuis ${src}`); move(u, 'hand'); done(`révèle ${name(c)} et l'ajoute à sa main.`)(); });
    if (playable) man('Jouer sans payer le coût', () => playCard(u, true));
    if (zone !== 'trash') man('Défausser', () => { move(u, 'trash'); done(`défausse ${name(c)} depuis ${src}.`)(); });
    man('Placer sur le dessus du deck', () => { move(u, 'deck', 'top'); done(`place une carte de ${src} sur son deck.`)(); });
    man('Placer sous le deck', () => { move(u, 'deck', 'bottom'); done(`place une carte de ${src} sous son deck.`)(); });
    if (zone !== 'life') man('Ajouter sur la Vie', () => { move(u, 'life', 'top'); done(`ajoute une carte de ${src} à sa Vie.`)(); });
  }
  if (!it.length) it.push({ label: 'Aucune action possible (actions libres : bouton « Effet manuel »)', fn: () => {}, disabled: true });
  return it;
}

function menuForPile(pile) {
  const me = G.me;
  const it = [];
  const act = (label, fn, opt = {}) => it.push({ label, fn, ...opt });
  if (pile === 'trash') { openViewer('trash'); return null; }
  if (!G.manual) {
    return [{ label: 'Actions libres verrouillées : utilisez « Effet manuel » pour un effet en texte libre', fn: () => {}, disabled: true }];
  }
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

// Choix de plusieurs cartes. opts : { min, max, selectable(inst), cancel } → tableau, ou null si annulé.
function pickMany(title, insts, getCard, opts = {}) {
  const { min = 0, max = 1, selectable = () => true, cancel = true } = opts;
  return new Promise((resolve) => {
    const chosen = new Set();
    const o = document.createElement('div');
    o.className = 'overlay';
    const draw = () => {
      o.innerHTML = `<div class="dialog wide" role="dialog" aria-label="${esc(title)}"><h3>${esc(title)}</h3>
        <p class="muted small">${max > 1 ? `Choisissez ${min === max ? max : `jusqu'à ${max}`} carte(s).` : 'Choisissez une carte.'} ${insts.length ? '' : 'Aucune carte possible.'}</p>
        <div class="card-grid">${insts.map((i, k) => `<button class="grid-card pick ${chosen.has(k) ? 'on' : ''} ${selectable(i) ? '' : 'off'}" data-k="${k}" ${selectable(i) ? '' : 'disabled'}>${cardHTML(getCard(i))}</button>`).join('')}</div>
        <div class="row-btns"><button class="btn primary" data-ok ${chosen.size >= Math.min(min, insts.length) ? '' : 'disabled'}>Valider (${chosen.size})</button>
        ${cancel ? '<button class="btn ghost" data-cancel>Annuler</button>' : ''}</div></div>`;
    };
    draw();
    document.body.append(o);
    o.addEventListener('click', (e) => {
      if (e.target.closest('[data-ok]')) { o.remove(); resolve([...chosen].map((k) => insts[k])); return; }
      if (e.target.closest('[data-cancel]')) { o.remove(); resolve(null); return; }
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (k === undefined) return;
      const n = +k;
      if (chosen.has(n)) chosen.delete(n);
      else if (max === 1) { chosen.clear(); chosen.add(n); }
      else if (chosen.size < max) chosen.add(n);
      draw();
    });
  });
}

// Remettre des cartes dans l'ordre voulu (flèches) → nouveau tableau.
function orderCards(title, insts, getCard) {
  return new Promise((resolve) => {
    const list = [...insts];
    const o = document.createElement('div');
    o.className = 'overlay';
    const draw = () => {
      o.innerHTML = `<div class="dialog wide" role="dialog" aria-label="${esc(title)}"><h3>${esc(title)}</h3>
        <div class="card-grid">${list.map((i, k) => `<div class="order-card">${cardHTML(getCard(i))}
          <div class="row-btns"><button class="btn small" data-up="${k}" ${k ? '' : 'disabled'}>←</button><span class="muted small">${k + 1}</span>
          <button class="btn small" data-down="${k}" ${k < list.length - 1 ? '' : 'disabled'}>→</button></div></div>`).join('')}</div>
        <div class="row-btns"><button class="btn primary" data-ok>Valider</button></div></div>`;
    };
    draw();
    document.body.append(o);
    o.addEventListener('click', (e) => {
      const up = e.target.closest('[data-up]')?.dataset.up;
      const down = e.target.closest('[data-down]')?.dataset.down;
      if (up !== undefined) { const k = +up; [list[k - 1], list[k]] = [list[k], list[k - 1]]; draw(); }
      else if (down !== undefined) { const k = +down; [list[k + 1], list[k]] = [list[k], list[k + 1]]; draw(); }
      else if (e.target.closest('[data-ok]')) { o.remove(); resolve(list); }
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
  let manual = '';
  if (G.phase === 'play' && G.manual) {
    manual = `<div class="manual-bar"><b>✋ Mode manuel</b> : effet de « ${esc(G.myCards[G.manual.c]?.name)} ». Vos actions sont visibles en rouge par l'adversaire.
      <button class="btn small primary" data-do="manual-end">Terminer</button></div>`;
  } else if (G.phase === 'play' && (myTurn() || G.battle?.role === 'def')) {
    manual = '<div class="row-btns"><button class="btn small ghost" data-do="manual-start" title="Pour une carte avec un effet en texte libre">✋ Effet manuel</button></div>';
  }
  if (G.phase === 'play' && G.oppManual) {
    manual += `<div class="manual-bar opp"><b>${esc(G.oppName)}</b> résout à la main l'effet de « ${esc(G.oppCards[G.oppManual]?.name)} ».
      <button class="btn small danger" data-do="contest">Contester</button></div>`;
  }
  return `<div class="center">${G.disconnected ? '<p class="msg err">Adversaire déconnecté.</p>' : ''}${inner}${manual}
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
  const auto = effectsText(c);
  return `<div class="big-card">${cardHTML(c)}</div>${extra}
    <div class="pv-text"><b>${esc(c.name)}</b> <span class="muted">${TYPES[c.type]}</span>
    ${auto.main ? `<p>${fmtEffect(auto.main)}</p>` : ''}${c.effect ? `<p class="free">✋ ${fmtEffect(c.effect)}</p>` : ''}
    ${auto.trigger || c.trigger ? `<p><span class="kw trig">Déclenchement</span> ${fmtEffect([auto.trigger, c.trigger].filter(Boolean).join(' '))}</p>` : ''}</div>`;
}

function logHTML() {
  return G.log.slice(-200).map((l) => {
    const who = l.who === 'me' ? G.name : l.who === 'opp' ? G.oppName : '';
    return `<li class="lg-${l.who}${l.chat ? ' chat' : ''}${l.manual ? ' manual' : ''}">${who ? `<b>${esc(who)}</b> ` : ''}${l.chat ? '💬 ' : ''}${esc(l.text)}</li>`;
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
    case 'manual-start': return chooseManualCard();
    case 'manual-end': return endManual();
    case 'contest':
      if (!confirm(`Contester l'effet manuel de ${G.oppName} ? Tout ce qu'il a fait depuis le début de cet effet sera annulé.`)) return undefined;
      send({ t: 'contest' });
      G.log.push({ who: 'me', text: 'conteste l\'effet manuel.' });
      return render();
    case 'rematch': send({ t: 'rematch' }); return resetMatch();
    case 'quit':
      clearSave();
      link?.close(); link = null; G = null;
      Object.assign(lobby, { status: 'idle', code: '', error: '' });
      return renderLobby();
    case 'v-shuffle': shuffle(G.me.deck); log('mélange son deck.'); G.viewer = null; return commit();
    case 'v-close': G.viewer = null; return render();
    case 'r-close': G.reveals = G.reveals.filter((r) => r.id !== el.dataset.rid); return render();
    default: return undefined;
  }
}

// ---------- outil de test automatique ----------
// Actif seulement en mode local avec ?test=1 : permet de lancer un effet et d'inspecter la partie.
const TESTING = new URLSearchParams(location.search).get('test') === '1';
if (TESTING) {
  window.__optcg = {
    G: () => G,
    run: async (effect, u) => {
      const src = (u && locate(u)?.inst) || G.me.leader;
      const ctx = await runEffect(src, effect, { idx: 99 });
      return ctx ? { played: Boolean(ctx.played) } : null;
    },
    place: (cardId, zone = 'chars', extra = {}) => {
      const inst = { u: uid(), c: cardId, r: false, d: 0, t: 0, ...extra };
      if (zone === 'stage') G.me.stage = inst; else G.me[zone].push(inst);
      commit();
      return inst.u;
    },
    power: (u) => myPower(locate(u).inst),
    cost: (u) => curCost(locate(u).inst, myCard(locate(u).inst)),
    kw: (u, k) => hasKw(locate(u).inst, k),
    prot: (u, k) => isProtected(locate(u).inst, k),
    commit: () => commit(),
    endTurn: () => endTurn(),
  };
}
