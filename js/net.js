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
