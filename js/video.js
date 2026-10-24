// Vidéo des cartes 1on1 : elle se lance par-dessus la carte (et peut en dépasser), les effets de la carte
// s'effacent pendant la lecture, puis la vidéo se fige sur sa dernière image et se fond dans l'illustration.
//
// card.video : adresse de la vidéo ; card.vx : position du bord gauche de la carte dans la vidéo (0 à 1,
// la carte occupe toute la hauteur de la vidéo).
import { resolveMedia, setVideoModule, stampSeal } from './cards.js';

// Un seul lecteur pour tout le site : débloqué (avec le son) au premier toucher, iOS accepte ensuite
// de le relancer avec le son sans nouveau toucher.
const SILENCE = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAWfbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAGQAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAlh0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAABQAAAAAAABAAAAAAHQbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAABABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABe21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATtzdGJsAAAAt3N0c2QAAAAAAAAAAQAAAKdhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALWF2Y0MBQsAK/+EAFWdCwAraewEQAAADABAAAAMDIPEiagEABWjOAZcgAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAA8vgAAPL4AAAAGHN0dHMAAAAAAAAAAQAAAAIAAAIAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAHHN0c3oAAAAAAAAAAAAAAAIAAAJlAAAACQAAABhzdGNvAAAAAAAAAAIAAAXkAAAIUQAAAnF0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAGQAAAAAAAAAAAAAAAEBAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAABkAAAEAAABAAAAAAHpbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAACsRAAAFTpVxAAAAAAALWhkbHIAAAAAAAAAAHNvdW4AAAAAAAAAAAAAAABTb3VuZEhhbmRsZXIAAAABlG1pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAABWHN0YmwAAAB+c3RzZAAAAAAAAAABAAAAbm1wNGEAAAAAAAAAAQAAAAAAAAAAAAEAEAAAAACsRAAAAAAANmVzZHMAAAAAA4CAgCUAAgAEgICAF0AVAAAAAAA+gAAACmUFgICABRIIVuUABoCAgAECAAAAFGJ0cnQAAAAAAAA+gAAACmUAAAAgc3R0cwAAAAAAAAACAAAABQAABAAAAAABAAABOgAAADRzdHNjAAAAAAAAAAMAAAABAAAAAQAAAAEAAAACAAAAAgAAAAEAAAADAAAAAwAAAAEAAAAsc3RzegAAAAAAAAAAAAAABgAAABUAAAAEAAAABAAAAAQAAAAEAAAABAAAABxzdGNvAAAAAAAAAAMAAAXPAAAISQAACFoAAAAac2dwZAEAAAByb2xsAAAAAgAAAAH//wAAABxzYmdwAAAAAHJvbGwAAAABAAAABgAAAAEAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYwLjE2LjEwMAAAAAhmcmVlAAACn21kYXTeAgBMYXZjNjAuMzEuMTAyAAIwQA4AAAJUBgX//1DcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MSBkZWJsb2NrPTA6MDowIGFuYWx5c2U9MDowIG1lPWRpYSBzdWJtZT0wIHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTAgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0wIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PTAgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTAgaW50cmFfcmVmcmVzaD0wIHJjPWNyZiBtYnRyZWU9MCBjcmY9NTEuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0wAIAAAAAJZYiEOiYoABXAARggBwEYIAcAAAAFQZogJpQBGCAHARggBwEYIAc=';
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
function unlock() {
  if (unlocked) return;
  unlocked = true;
  const v = getPlayer();
  if (v.src) return;
  v.src = SILENCE;
  v.play().then(() => v.pause()).catch(() => { unlocked = false; });
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
    v.muted = false;
    v.play().catch(() => { v.muted = true; v.play().catch(() => resolveEnd()); }); // son refusé : on joue sans
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
