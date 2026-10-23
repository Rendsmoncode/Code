// Paramètres du joueur (gardés dans ce navigateur) : pour l'instant, l'ambiance du plateau sur téléphone.
import { esc } from './cards.js';

export const THEMES = {
  pocket: { name: 'Pocket clair', desc: 'Blanc, aéré, couleurs douces.' },
  nuit: { name: 'Pocket nuit', desc: 'La même douceur sur fond bleu nuit.' },
  duel: { name: 'Duel', desc: 'Noir profond, grille holographique, traits fins.' },
  manga: { name: 'Manga', desc: 'Papier blanc, encre noire, une touche de rouge.' },
  lagon: { name: 'Lagon', desc: 'L\'adversaire en mer, vous sur la plage.' },
};
const KEY = 'optcgm-theme';

export function getTheme() {
  try { const t = localStorage.getItem(KEY); if (THEMES[t]) return t; } catch { /* stockage indisponible */ }
  return 'pocket';
}
function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new CustomEvent('optcgm-theme', { detail: t }));
}

export function openSettings() {
  document.querySelector('.overlay.settings')?.remove();
  const o = document.createElement('div');
  o.className = 'overlay settings';
  const cur = getTheme();
  o.innerHTML = `<div class="dialog" role="dialog" aria-label="Paramètres">
    <h3>Paramètres</h3>
    <p class="small muted">Ambiance du plateau de jeu sur téléphone.</p>
    <div class="theme-list">${Object.entries(THEMES).map(([k, t]) => `<button type="button" class="theme-opt ${k === cur ? 'on' : ''}" data-theme="${k}" aria-pressed="${k === cur}">
      <img src="img/themes/${k}.webp" alt="" loading="lazy"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></button>`).join('')}</div>
    <div class="row-btns"><button type="button" class="btn primary" data-close>Fermer</button></div></div>`;
  document.body.append(o);
  o.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (b) {
      setTheme(b.dataset.theme);
      o.querySelectorAll('[data-theme]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      return;
    }
    if (e.target.closest('[data-close]') || e.target === o) o.remove();
  });
}
