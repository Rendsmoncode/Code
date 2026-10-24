// Vidéo des cartes 1on1 : elle se lance par-dessus la carte (et peut en dépasser), les effets de la carte
// s'effacent pendant la lecture, puis la vidéo se fige sur sa dernière image et se fond dans l'illustration.
//
// card.video : adresse de la vidéo ; card.vx : position du bord gauche de la carte dans la vidéo (0 à 1,
// la carte occupe toute la hauteur de la vidéo).
import { resolveMedia, setVideoModule, stampSeal } from './cards.js';

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
// Son des 1on1 : lecteur audio débloqué au premier toucher (iOS accepte ensuite de le relancer seul).
const sfx = new Audio();
sfx.preload = 'auto';
function unlock() {
  if (unlocked || !sfx.paused) return;
  unlocked = true;
  sfx.src = SILENCE;
  sfx.play().then(() => { sfx.pause(); sfx.src = 'sons/1on1.mp3'; sfx.load(); }).catch(() => { unlocked = false; });
}
// Son de révélation d'une 1on1 : 2,6 s de montée (pendant l'animation), puis l'impact quand la carte apparaît.
export function playRevealSound() {
  if (!sfx.src.endsWith('sons/1on1.mp3')) sfx.src = 'sons/1on1.mp3';
  sfx.currentTime = 0;
  sfx.volume = 0.9;
  sfx.play().catch(() => {});
}
for (const ev of ['pointerup', 'touchend', 'keydown']) document.addEventListener(ev, unlock, { capture: true, passive: true });

export const hasVideo = (card) => Boolean(card?.rarity === 'S' && card.video);

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
  let resolveEnd;
  const ended = new Promise((r) => { resolveEnd = r; });
  stopCurrent = () => { stopCurrent = null; resolveEnd(); };
  v.addEventListener('ended', () => resolveEnd(), { once: true });
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
    v.muted = true; // la vidéo est muette : c'est le son de la rareté 1on1 qui accompagne la révélation
    v.play().catch(() => resolveEnd());
    await ended;
    if (done) return true;
    done = true;
    removeEventListener('resize', layout);
    v.pause();
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
    stampSeal(host); // le sceau 1ON1 vient se plaquer sur la carte
    await wait(650);
    wrap.remove();
    host.classList.remove('vid-on', 'vid-end');
    return true;
  })();
}
export function stopCardVideo() { stopCurrent?.(); }

setVideoModule({ hasVideo, playCardVideo, stopCardVideo });
