// Connexion entre les deux joueurs.
// - mode « online » : connexion directe navigateur à navigateur via PeerJS (WebRTC).
// - mode « local » : deux onglets du même navigateur (BroadcastChannel), pratique pour tester seul.

const PREFIX = 'optcgm-';

export function randomCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join('');
}

// handlers : { onReady(code), onOpen(), onMessage(msg), onClose(), onError(text) }
// code : réutilisé pour reprendre une partie après un rechargement de page.
export function host(mode, h, code = randomCode()) {
  return mode === 'local' ? localLink(code, true, h) : peerHost(code, h);
}

export function join(mode, code, h) {
  return mode === 'local' ? localLink(code, false, h) : peerJoin(code, h);
}

function wire(conn, h) {
  conn.on('open', () => h.onOpen());
  conn.on('data', (m) => h.onMessage(m));
  conn.on('close', () => h.onClose());
  conn.on('error', (e) => h.onError(String(e?.message || e)));
}

function peerHost(code, h) {
  const peer = new window.Peer(PREFIX + code);
  let conn = null;
  peer.on('open', () => h.onReady(code));
  peer.on('connection', (c) => {
    if (conn?.open) { c.on('open', () => c.close()); return; } // partie déjà pleine (sinon : reconnexion)
    conn = c;
    wire(c, h);
  });
  peer.on('error', (e) => h.onError(peerError(e)));
  return {
    send: (m) => conn?.open && conn.send(m),
    close: () => peer.destroy(),
  };
}

function peerJoin(code, h) {
  const peer = new window.Peer();
  let conn = null;
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true });
    wire(conn, h);
  });
  peer.on('error', (e) => h.onError(peerError(e)));
  return {
    send: (m) => conn?.open && conn.send(m),
    close: () => peer.destroy(),
  };
}

// ---------- Game Master ----------
// Chaque joueur ouvre une « porte » sur sa partie (code + rôle) ; le Game Master s'y connecte pour voir
// l'état complet des deux joueurs et leur envoyer des corrections.
// Joueur : h = { onMessage(m) } ; renvoie { send(m), close() } (send va à tous les Game Masters connectés).
export function gmListen(mode, code, role, h) {
  const id = `${PREFIX}${code}-gm-${role}`;
  if (mode === 'local') {
    const ch = new BroadcastChannel(id);
    ch.onmessage = ({ data }) => h.onMessage(data);
    return { send: (m) => ch.postMessage(m), close: () => ch.close() };
  }
  let peer = null;
  const conns = new Set();
  const start = () => {
    peer = new window.Peer(id);
    peer.on('connection', (c) => {
      conns.add(c);
      c.on('data', (m) => h.onMessage(m));
      c.on('close', () => conns.delete(c));
    });
    // Identifiant encore réservé (page rechargée) : on réessaie un peu plus tard.
    peer.on('error', (e) => { if (e?.type === 'unavailable-id') setTimeout(() => { peer.destroy(); start(); }, 4000); });
  };
  start();
  return { send: (m) => conns.forEach((c) => c.open && c.send(m)), close: () => peer?.destroy() };
}

// Game Master : se connecte aux deux joueurs d'une partie. h = { onMessage(role, m), onStatus(role, ok) }.
export function gmConnect(mode, code, h) {
  code = code.trim().toUpperCase();
  const roles = ['host', 'guest'];
  if (mode === 'local') {
    const chs = Object.fromEntries(roles.map((r) => {
      const ch = new BroadcastChannel(`${PREFIX}${code}-gm-${r}`);
      ch.onmessage = ({ data }) => { h.onStatus(r, true); h.onMessage(r, data); };
      return [r, ch];
    }));
    roles.forEach((r) => chs[r].postMessage({ t: 'gmHello' }));
    return { send: (r, m) => chs[r].postMessage(m), close: () => roles.forEach((r) => chs[r].close()) };
  }
  const peer = new window.Peer();
  const conns = {};
  let closed = false;
  const dial = (r) => {
    if (closed) return;
    const c = peer.connect(`${PREFIX}${code}-gm-${r}`, { reliable: true });
    conns[r] = c;
    c.on('open', () => { h.onStatus(r, true); c.send({ t: 'gmHello' }); });
    c.on('data', (m) => h.onMessage(r, m));
    c.on('close', () => { h.onStatus(r, false); setTimeout(() => dial(r), 3000); });
  };
  peer.on('open', () => roles.forEach(dial));
  // Joueur pas (encore) joignable : on réessaie.
  peer.on('error', (e) => {
    if (e?.type !== 'peer-unavailable') return;
    const r = roles.find((x) => String(e.message || '').endsWith(`-gm-${x}`));
    if (r) { h.onStatus(r, false); setTimeout(() => dial(r), 3000); }
  });
  return {
    send: (r, m) => conns[r]?.open && conns[r].send(m),
    close: () => { closed = true; peer.destroy(); },
  };
}

function peerError(e) {
  if (e?.type === 'peer-unavailable') return 'Partie introuvable : vérifiez le code (ou l\'hôte a fermé sa page).';
  if (e?.type === 'unavailable-id') return 'Code déjà utilisé, réessayez.';
  if (e?.type === 'network' || e?.type === 'server-error') return 'Impossible de joindre le serveur de connexion. Vérifiez votre connexion Internet.';
  return `Erreur de connexion (${e?.type || e}).`;
}

// Mode local : les deux onglets s'annoncent (« hi ») en arrivant ; chacun répond, ce qui permet aussi
// de se retrouver après le rechargement d'un des deux onglets.
function localLink(code, isHost, h) {
  const ch = new BroadcastChannel(PREFIX + code);
  const me = Math.random().toString(36).slice(2);
  let open = false;
  const post = (kind, data) => ch.postMessage({ from: me, kind, data });
  ch.onmessage = ({ data: m }) => {
    if (m.from === me) return;
    if (m.kind === 'hi') { post('hi-back'); open = true; h.onOpen(); }
    else if (m.kind === 'hi-back' && !open) { open = true; h.onOpen(); }
    else if (m.kind === 'msg') h.onMessage(m.data);
    else if (m.kind === 'bye') { open = false; h.onClose(); }
  };
  if (isHost) setTimeout(() => h.onReady(code));
  post('hi');
  addEventListener('beforeunload', () => post('bye'));
  return {
    send: (data) => post('msg', data),
    close: () => { post('bye'); ch.close(); },
  };
}
