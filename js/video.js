// Vidéo des cartes 1on1 : elle se lance par-dessus la carte (et peut en dépasser), les effets de la carte
// s'effacent pendant la lecture, puis la vidéo se fige sur sa dernière image et se fond dans l'illustration.
//
// card.video : adresse de la vidéo ; card.vx : position du bord gauche de la carte dans la vidéo (0 à 1,
// la carte occupe toute la hauteur de la vidéo).
import { resolveMedia, setVideoModule } from './cards.js';

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
// host : l'élément qui contient la carte (.card). Renvoie une promesse résolue à la fin (ou à l'arrêt).
export function playCardVideo(card, host) {
  if (!hasVideo(card) || !host) return Promise.resolve(false);
  stopCurrent?.();
  const v = getPlayer();
  preloadVideo(card);
  const wrap = document.createElement('div');
  wrap.className = 'cv-vwrap';
  wrap.style.setProperty('--vx', Number(card.vx) || 0);
  wrap.append(v);
  host.classList.add('vid-on');
  host.append(wrap);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener('ended', onEnd);
      // fondu : la carte (et ses effets) revient, la vidéo figée s'efface
      host.classList.add('vid-end');
      setTimeout(() => { wrap.remove(); v.pause(); host.classList.remove('vid-on', 'vid-end'); resolve(true); }, 700);
    };
    const onEnd = () => finish();
    stopCurrent = () => { stopCurrent = null; finish(); };
    const ratio = () => { if (v.videoWidth) wrap.style.setProperty('--va', v.videoWidth / v.videoHeight); };
    v.addEventListener('loadedmetadata', ratio, { once: true });
    ratio();
    v.addEventListener('ended', onEnd);
    v.currentTime = 0;
    v.muted = false;
    v.play().catch(() => { v.muted = true; v.play().catch(finish); }); // son refusé : on joue sans
  });
}
export function stopCardVideo() { stopCurrent?.(); }

setVideoModule({ hasVideo, playCardVideo, stopCardVideo });
