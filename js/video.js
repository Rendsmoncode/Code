// Vidéo des cartes 1on1 et Alt : elle se lance par-dessus la carte (et peut en dépasser), les effets de la carte
// s'effacent pendant la lecture, puis la vidéo se fige sur sa dernière image et se fond dans l'illustration.
//
// card.video : adresse de la vidéo ; card.vx : position du bord gauche de la carte dans la vidéo (0 à 1,
// la carte occupe toute la hauteur de la vidéo).
import { resolveMedia, setVideoModule, stampSeal } from './cards.js';
import { S } from './store.js';

// Un seul lecteur vidéo pour tout le site (muet : il se lance sans toucher).
const SILENCE = 'data:audio/wav;base64,UklGRpYDAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YXIDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // 10 ms de silence
let player = null;
let unlocked = false;
function getPlayer() {
  if (player) return player;
  player = document.createElement('video');
  player.className = 'cv-video';
  player.playsInline = true;
  player.setAttribute('playsinline', '');
  player.preload = 'auto';
  return player;
}
// Musiques des révélations, lues par un seul lecteur débloqué au premier toucher (exigé par iOS) :
// - 1on1 : sons/1on1.mp3 (composée pour le jeu), son « bing » tombe quand le sceau s'écrase ;
// - Alt : la chanson envoyée dans Admin → Musiques ; quand l'étoile se colle, le cling retentit
//   et la chanson baisse puis continue tant qu'on reste sur la carte.
const TRACKS = {
  '1on1': { src: () => 'sons/1on1.mp3', intro: 2.6 },
  alt: { src: () => S.music?.alt?.url || '', intro: 2.574 },
};
export const VIDEO_LEN = 6.8; // durée commune de toutes les vidéos (image figée comprise)
const SHRINK = 0.75; // la vidéo rétrécit jusqu'à la carte
const STAMP_HIT = 0.64; // le sceau / l'étoile touche la carte 0,64 s après le début de son animation
const HIT = TRACKS['1on1'].intro + VIDEO_LEN + SHRINK + STAMP_HIT; // 10,79 s : le « bing » de la musique 1on1
const DUCK = 0.3; // volume de la chanson Alt une fois l'étoile collée
const sfx = new Audio();
sfx.preload = 'auto';
const cling = new Audio('sons/cling.mp3');
cling.preload = 'auto';
let ceremony = false; // une séquence vidéo + musique est en cours
let current = ''; // musique en cours : '1on1' ou 'alt'
let fadeTimer = null;
function unlock() {
  if (unlocked || !sfx.paused) return;
  unlocked = true;
  sfx.src = SILENCE;
  cling.muted = true;
  cling.play().then(() => { cling.pause(); cling.muted = false; cling.currentTime = 0; }).catch(() => { cling.muted = false; });
  sfx.play().then(() => { sfx.pause(); sfx.src = TRACKS['1on1'].src(); sfx.load(); }).catch(() => { unlocked = false; });
}
const sameSrc = (a, b) => a && b && (a === b || a.endsWith(b) || decodeURI(a).endsWith(b));
function ramp(to, ms, then) {
  clearInterval(fadeTimer);
  const from = sfx.volume; const t0 = performance.now();
  fadeTimer = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / ms);
    sfx.volume = Math.max(0, Math.min(1, from + (to - from) * p));
    if (p >= 1) { clearInterval(fadeTimer); then?.(); }
  }, 30);
}
function music(kind, at = 0) {
  const src = TRACKS[kind].src();
  if (!src) return false;
  clearInterval(fadeTimer);
  if (!sameSrc(sfx.src, src)) sfx.src = src;
  current = kind;
  sfx.currentTime = at;
  sfx.volume = 0.9;
  sfx.play().catch(() => {});
  return true;
}
// Début de l'animation qui annonce une 1on1 ou une Alt : la musique commence.
export function startCeremony(kind = '1on1') { music(kind, 0); }
// La musique s'arrête en fondu (carte suivante, fermeture).
export function stopMusic() {
  if (sfx.paused) return;
  ramp(0, 600, () => sfx.pause());
  current = '';
}
// Le sceau ou l'étoile commence à s'écraser. 1on1 : sans séquence en cours, on lance la fin de la musique pour
// que le « bing » tombe pile. Alt : le cling à l'impact, et la chanson (si elle joue) baisse puis continue.
export function sealSound(alt = false) {
  if (alt) {
    setTimeout(() => {
      cling.currentTime = 0; cling.volume = 1; cling.play().catch(() => {});
      if (current === 'alt' && !sfx.paused) ramp(DUCK, 300);
    }, STAMP_HIT * 1000);
    return;
  }
  if (!ceremony) music('1on1', HIT - STAMP_HIT);
}
for (const ev of ['pointerup', 'touchend', 'keydown']) document.addEventListener(ev, unlock, { capture: true, passive: true });

export const hasVideo = (card) => Boolean((card?.rarity === 'S' || card?.alt) && card.video);

// Précharge la vidéo (au début de l'animation 1on1, pour qu'elle démarre sans attendre).
export function preloadVideo(card) {
  if (!hasVideo(card)) return;
  const v = getPlayer();
  const src = resolveMedia(card.video);
  if (v.dataset.src !== src) { v.dataset.src = src; v.src = src; v.load(); }
}

let stopCurrent = null;
const CARD_RATIO = 63 / 88;
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
const metadata = (v) => (v.readyState >= 1 ? Promise.resolve() : new Promise((r) => {
  v.addEventListener('loadedmetadata', r, { once: true });
  v.addEventListener('error', r, { once: true });
  setTimeout(r, 4000);
}));

// host : l'élément qui contient la carte (.card). Renvoie une promesse résolue à la fin (ou à l'arrêt).
// Vidéo verticale : plein écran, puis à la fin elle rétrécit pour se poser exactement dans la carte.
// Vidéo en paysage : posée sur la carte et plus large qu'elle.
export function playCardVideo(card, host) {
  if (!hasVideo(card) || !host) return Promise.resolve(false);
  stopCurrent?.();
  const v = getPlayer();
  preloadVideo(card);
  const wrap = document.createElement('div');
  wrap.className = 'cv-vwrap';
  wrap.append(v);
  host.classList.add('vid-on');
  let done = false;
  let aborted = false;
  let resolveEnd;
  const ended = new Promise((r) => { resolveEnd = r; });
  stopCurrent = (abort = false) => { stopCurrent = null; aborted = abort; resolveEnd(); };

  return (async () => {
    await metadata(v);
    const vw = v.videoWidth || 1080;
    const vh = v.videoHeight || 1440;
    // position de la carte dans la vidéo : réglée dans l'onglet Cartes, sinon centrée
    const vx = card.vx == null || card.vx === '' ? Math.max(0, (1 - (vh * CARD_RATIO) / vw) / 2) : Number(card.vx);
    const full = vh > vw; // vidéo verticale : plein écran
    if (full) {
      wrap.classList.add('full');
      document.body.append(wrap);
    } else {
      wrap.style.setProperty('--va', vw / vh);
      wrap.style.setProperty('--vx', vx);
      host.append(wrap);
    }
    const layout = () => {
      if (!full) return null;
      // plein écran : on couvre un téléphone (portrait), on prend toute la hauteur sur un écran large
      const W = innerWidth;
      const H = innerHeight;
      const sc = W < H ? Math.max(W / vw, H / vh) : H / vh;
      const dw = vw * sc;
      const dh = vh * sc;
      const ox = (W - dw) / 2;
      const oy = (H - dh) / 2;
      Object.assign(v.style, { left: `${ox}px`, top: `${oy}px`, width: `${dw}px`, height: `${dh}px` });
      // zone de la carte dans la vidéo, à l'écran
      const cw = vh * CARD_RATIO;
      return { x: ox + vx * vw * sc, y: oy, w: cw * sc, h: dh, W, H };
    };
    layout();
    addEventListener('resize', layout);
    v.currentTime = 0;
    v.muted = true; // la vidéo est muette : c'est la musique de la rareté qui l'accompagne
    ceremony = true;
    await v.play().catch(() => {});
    // la vidéo démarre à la fin de l'annonce : on recale la musique si besoin
    const kind = card.alt ? 'alt' : '1on1'; const INTRO = TRACKS[kind].intro;
    const playing = !sfx.paused && current === kind && sfx.currentTime < INTRO + 1.5;
    if (!playing) music(kind, INTRO);
    else if (Math.abs(sfx.currentTime - INTRO) > 0.12) sfx.currentTime = INTRO;
    const t0 = performance.now();
    // toutes les vidéos durent VIDEO_LEN : au-delà on coupe, en deçà l'image reste figée
    await Promise.race([ended, wait(VIDEO_LEN * 1000)]);
    // toucher pour passer : la musique saute au même moment, pour que le « bing » reste calé sur le sceau
    if ((performance.now() - t0) / 1000 < VIDEO_LEN - 0.1 && !sfx.paused && current === kind) sfx.currentTime = INTRO + VIDEO_LEN;
    if (done) return true;
    done = true;
    removeEventListener('resize', layout);
    v.pause();
    if (aborted) { ceremony = false; stopMusic(); wrap.remove(); host.classList.remove('vid-on'); return false; }
    if (full) {
      // la vidéo figée rétrécit jusqu'à la carte ; ce qui dépasse s'efface
      const z = layout();
      const r = host.querySelector('.card')?.getBoundingClientRect() || host.getBoundingClientRect();
      const k = r.width / z.w;
      wrap.style.setProperty('--clip', `inset(${z.y}px ${z.W - z.x - z.w}px ${z.H - z.y - z.h}px ${z.x}px round ${z.w * 0.025}px)`);
      wrap.style.transform = `translate(${r.left - z.x * k}px, ${r.top - z.y * k}px) scale(${k})`;
      wrap.classList.add('shrink');
      await wait(750);
    }
    // fondu : la carte (et ses effets) revient, la vidéo figée s'efface
    host.classList.add('vid-end');
    wrap.classList.add('out');
    stampSeal(host); // le sceau 1ON1 ou l'étoile Alt vient se plaquer sur la carte, sur le « bing » / cling
    await wait(650);
    wrap.remove();
    host.classList.remove('vid-on', 'vid-end');
    setTimeout(() => { ceremony = false; }, 1200);
    return true;
  })();
}
// abort : la vue est fermée, on arrête tout (vidéo et musique) ; sinon on passe directement à la fin.
export function stopCardVideo(abort = false) {
  if (stopCurrent) stopCurrent(abort);
  else if (abort) stopMusic();
}

// Animation d'une carte en partie : vidéo plein écran avec son propre son (s'il y en a), un toucher la passe.
export function playMomentVideo(url) {
  if (!url) return Promise.resolve();
  document.querySelector('.anim-ov')?.remove();
  const ov = document.createElement('div');
  ov.className = 'anim-ov';
  const v = document.createElement('video');
  v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
  v.src = resolveMedia(url);
  ov.append(v);
  document.body.append(ov);
  return new Promise((resolve) => {
    let done = false;
    const end = () => { if (done) return; done = true; ov.classList.add('out'); setTimeout(() => ov.remove(), 300); resolve(); };
    v.addEventListener('ended', end);
    v.addEventListener('error', end);
    ov.addEventListener('click', end);
    setTimeout(end, 15000); // sécurité
    v.muted = false; v.volume = 1;
    v.play().catch(() => { v.muted = true; v.play().catch(end); }); // son refusé par le navigateur : on joue sans
  });
}

setVideoModule({ hasVideo, playCardVideo, stopCardVideo, sealSound, startCeremony, stopMusic });
