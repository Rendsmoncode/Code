// Modèle de carte, constantes du jeu et rendu HTML d'une carte.
import { effectsText } from './effects.js';
import { logoSVG } from './logo.js';

export const COLORS = {
  rouge: { label: 'Rouge', hex: '#c8302c' },
  vert: { label: 'Vert', hex: '#178a4c' },
  bleu: { label: 'Bleu', hex: '#2364c4' },
  violet: { label: 'Violet', hex: '#7a3db0' },
  noir: { label: 'Noir', hex: '#2f2f36' },
  jaune: { label: 'Jaune', hex: '#d9a90f' },
};

export const TYPES = {
  leader: 'Leader',
  character: 'Personnage',
  event: 'Événement',
  stage: 'Lieu',
};

// Raretés, de la plus courante à la plus rare. Le code (C, UC…) est celui stocké en base.
export const RARITIES = {
  C: { label: 'Commune', short: 'C' },
  UC: { label: 'Peu commune', short: 'UC' },
  R: { label: 'Rare', short: 'R' },
  SR: { label: 'Super rare', short: 'SR' },
  UR: { label: 'Ultra rare', short: 'UR' },
  L: { label: 'Légendaire', short: 'LR' },
  S: { label: '1on1', short: '1ON1' },
};
export const RARITY_ORDER = Object.keys(RARITIES);

export const ATTRIBUTES = ['Frappe', 'Tranchant', 'Distance', 'Spécial', 'Sagesse'];

// Mots-clés insérables depuis l'éditeur. Ceux marqués `kw` sont aussi détectés par le moteur.
export const KEYWORDS = [
  '[Bloqueur]', '[Initiative]', '[Double attaque]', '[Exil]',
  '[Jouée]', '[Attaque]', '[Bloquée]', '[KO]',
  '[Activation : Principale]', '[Principale]', '[Contre]', '[Déclenchement]',
  '[Fin de votre tour]', '[Tour de l\'adversaire]', '[Votre tour]', '[Une fois par tour]',
  '[DON!! x1]', '[DON!! x2]', '①', '②',
];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Mots-clés : cases cochées dans l'éditeur (card.keywords), ou écrits dans le texte libre.
const hasWord = (card, key, words) => {
  if (card?.keywords?.includes(key)) return true;
  const t = `${card?.effect || ''}`.toLowerCase();
  return words.some((w) => t.includes(w));
};
export const isBlocker = (c) => hasWord(c, 'blocker', ['[bloqueur]', '[blocker]']);
export const hasRush = (c) => hasWord(c, 'rush', ['[initiative]', '[rush]']);
export const hasDoubleAttack = (c) => hasWord(c, 'double', ['[double attaque]', '[double attack]']);
export const hasBanish = (c) => hasWord(c, 'banish', ['[exil]', '[banish]']);
export const isUnblockable = (c) => hasWord(c, 'unblockable', ['[imblocable]']);

// Une carte a 1 ou 2 attributs, stockés dans `attribute` sous la forme « Frappe / Tranchant ».
export const attributesOf = (card) => String(card?.attribute || '').split('/').map((a) => a.trim()).filter(Boolean).slice(0, 2);

// Clé CSS d'un attribut (pour son icône) : « Spécial » → « special ».
const attrKey = (a) => a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '');

export function newCard() {
  return {
    id: uid(), code: '', name: '', type: 'character', colors: ['rouge'],
    cost: 1, life: 5, power: 1000, counter: 1000, attribute: 'Frappe',
    traits: '', effect: '', trigger: '', image: '', rarity: 'C', inBoosters: true, ink: 'light',
    keywords: [], effects: [],
  };
}

export function fmtEffect(txt) {
  return esc(txt)
    .replace(/\[([^\]]+)\]/g, '<span class="kw">$1</span>')
    .replace(/\n/g, '<br>');
}

// Éclaircit (amt > 0) ou assombrit (amt < 0) une couleur #rrggbb.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

// Les images du jeu sont privées : le magasin fournit une adresse temporaire pour chaque image.
let imageResolver = (url) => url;
export function setImageResolver(fn) { imageResolver = fn; }
export const resolveMedia = (url) => imageResolver(url);
// Animations en partie : une vidéo par moment (card.anims[moment]), jouée en plein écran chez les deux joueurs.
export const ANIM_MOMENTS = {
  onPlay: 'Quand elle est jouée',
  onAttack: 'Quand elle attaque',
  onBlock: 'Au moment où elle bloque',
  blockWin: 'Blocage réussi (elle tient l\'attaque)',
  blockLose: 'Blocage raté (elle est mise KO)',
  onKO: 'Quand elle est mise KO',
  counter: 'Quand elle est utilisée en Contre',
  trigger: 'Quand son Déclenchement s\'active',
};

// o.power : puissance affichée (si modifiée), o.cls : classes en plus, o.attrs : attributs HTML en plus.
export function cardHTML(card, o = {}) {
  if (!card) return `<div class="card back ${o.cls || ''}" ${o.attrs || ''}><div class="frame"><div class="back-logo">${logoSVG()}</div></div></div>`;
  const t = card.type;
  const fighter = t === 'leader' || t === 'character';
  const cost = t === 'leader'
    ? `<div class="lead-tag">Leader</div><div class="life" title="Vie"><span>${esc(card.life)}</span></div>`
    : `<div class="cost" title="Coût"><span>${esc(card.cost ?? 0)}</span></div>`;
  let pow = '';
  if (fighter) {
    const base = Number(card.power) || 0;
    const shown = o.power ?? base;
    const diff = shown > base ? ' up' : shown < base ? ' down' : '';
    pow = `<div class="pow${diff}" title="Puissance"><span>${shown}</span></div>`;
  }
  const ctr = t === 'character' && Number(card.counter) > 0
    ? `<div class="ctr" title="Contre"><span>+${esc(card.counter)}</span></div>` : '';
  const attrs = attributesOf(card);
  const attr = fighter && attrs.length ? `<div class="attr">${attrs.map((a) => `<span class="a-${attrKey(a)}">${esc(a)}</span>`).join('')}</div>` : '';
  // Texte affiché = effets automatiques (générés) + texte libre.
  const auto = effectsText(card);
  const fxText = [auto.main, card.effect].filter(Boolean).join('\n');
  const trigText = [auto.trigger, card.trigger].filter(Boolean).join(' ');
  const trig = trigText && t !== 'leader'
    ? `<div class="trg"><span class="kw trig">Déclenchement</span> ${fmtEffect(trigText)}</div>` : '';
  const r = RARITIES[card.rarity] ? card.rarity : 'C';
  const hex = (card.colors?.length ? card.colors : ['noir']).map((c) => COLORS[c]?.hex || '#555');
  const len = (card.name || '').length;
  // Cadrage libre de l'image (card.art : z = zoom, x / y = décalage en % de la carte).
  const a = card.art || {};
  const artImg = card.image
    ? `<img src="${esc(imageResolver(card.image))}" alt="" draggable="false" style="transform:translate(${Number(a.x) || 0}%, ${Number(a.y) || 0}%) scale(${Number(a.z) || 1})">` : logoSVG('art-logo');
  const c2 = hex[1] || hex[0];
  // Encadré des effets libre (card.box : l = gauche, w = largeur, b = hauteur depuis le bas, en % ; fs = taille du texte).
  const bx = card.box;
  const boxVars = bx ? `;--info-l:${bx.l}cqw;--info-r:${100 - bx.l - bx.w}cqw;--info-b:${bx.b * 1.397}cqw;--info-fs:${bx.fs || 1}` : '';
  const vars = `--c1:${hex[0]};--c2:${c2};--c1l:${shade(hex[0], 0.45)};--c1d:${shade(hex[0], -0.55)};--c1k:${shade(hex[0], -0.85)};--c2d:${shade(c2, -0.55)}${boxVars}`;
  const ink = card.ink === 'dark' ? ' ink-dark' : '';
  const alt = card.alt ? ' alt' : '';
  return `<div class="card t-${t} r-${r}${ink}${alt} ${o.cls || ''}" style="${vars}" ${o.attrs || ''}>
    <div class="frame">
      <div class="art${card.image ? '' : ' empty'}">${artImg}</div>
      ${cost}${pow}${ctr}${attr}
      <div class="nm${len > 18 ? ' xlong' : len > 13 ? ' long' : ''}"><span>${esc(card.name || 'Sans nom')}</span></div>
      ${card.traits ? `<div class="traits">${esc(card.traits)}</div>` : ''}
      <div class="info"><div class="info-in">
        <div class="tl">${TYPES[t] || ''}</div>
        ${fxText ? `<div class="fx">${fmtEffect(fxText)}</div>` : ''}
        ${trig}
      </div></div>
      <div class="rar" title="${RARITIES[r].label}">${RARITIES[r].short}</div>
      <div class="foil"></div>
    </div>
    ${r === 'S' ? '<div class="seal" aria-hidden="true">1<small>ON</small>1</div>' : ''}
    ${card.alt ? altHTML() : ''}
  </div>`;
}

// ---------- cartes Alt : la grande étoile en haut à droite et les mini étoiles qui scintillent ----------
export const STAR_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8 C53 38 62 47 92 50 C62 53 53 62 50 92 C47 62 38 53 8 50 C38 47 47 38 50 8 Z" fill="currentColor"/></svg>';
const MINI = [[12, 18, 3.4], [30, 8, 2.8], [84, 34, 3.2], [70, 60, 2.8], [18, 52, 3.2], [48, 26, 2.6], [90, 70, 3.2], [8, 66, 2.8], [60, 12, 3], [38, 44, 2.6], [76, 22, 2.8], [24, 30, 3]];
function altHTML() {
  const minis = MINI.map(([x, y, sz], k) => `<i style="--x:${x}%;--y:${y}%;--s:${sz}cqw;--d:${(2.2 + ((k * 37) % 14) / 10).toFixed(2)}s;--w:${(-k * 0.27).toFixed(2)}s${k % 3 === 1 ? ';--c:#cfe0ff' : ''}">${STAR_SVG}</i>`).join('');
  return `<div class="mstars" aria-hidden="true">${minis}</div><div class="astar" title="Alt">${STAR_SVG}</div><div class="aboom"></div>`;
}
// Chaque mini étoile réapparaît ailleurs à chaque cycle (en évitant le bas de la carte).
if (typeof document !== 'undefined') {
  document.addEventListener('animationiteration', (e) => {
    const i = e.target;
    if (!i.parentElement?.classList?.contains('mstars')) return;
    i.style.setProperty('--x', `${8 + Math.random() * 84}%`);
    i.style.setProperty('--y', `${6 + Math.random() * 70}%`);
  }, true);
}

// Redimensionne une image importée pour qu'elle reste légère (stockage + envoi en ligne).
export function resizeImage(file, max = 500) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function download(filename, data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function readJSONFile(file) {
  return file.text().then((t) => JSON.parse(t));
}

// Carte affichée en très grand par-dessus la page (collection, boosters). Un toucher / clic / Échap la ferme.
// hold : la vue se ferme quand on relâche (appui long pendant l'ouverture d'un booster).
// video : lance la vidéo de la 1on1 (si elle en a une).
let videoMod = null;
export function setVideoModule(m) { videoMod = m; }
export function showCardBig(card, { hold = false, video = false } = {}) {
  if (!card) return null;
  document.querySelector('.cardview')?.remove();
  const ov = document.createElement('div');
  ov.className = 'cardview';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', card.name || 'Carte');
  ov.innerHTML = `<div class="cv-card">${cardHTML(card)}</div>${hold ? '' : '<p class="cv-hint">Touchez pour fermer</p>'}`;
  const close = () => { videoMod?.stopCardVideo(true); ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  if (!hold) { ov.addEventListener('click', close); document.addEventListener('keydown', onKey); }
  document.body.append(ov);
  const host = ov.querySelector('.cv-card');
  if (video && videoMod?.hasVideo(card)) videoMod.playCardVideo(card, host); // le sceau s'écrase à la fin de la vidéo
  else if (!hold && (card.rarity === 'S' || card.alt)) stampSeal(host); // toute 1on1 / Alt ouverte en grand : le sceau / l'étoile s'écrase
  return close;
}

// Le sceau 1ON1 arrive depuis la caméra et s'écrase sur la carte (avec une secousse et une onde dorée).
export function stampSeal(host) {
  if (!host?.querySelector('.seal, .astar')) return;
  host.classList.remove('stamp');
  void host.offsetWidth; // relance l'animation
  host.classList.add('stamp');
  // le son tombe au moment de l'impact : « bing » de la musique 1on1, ou cling d'une Alt
  videoMod?.sealSound(Boolean(host.querySelector('.card.alt')));
  setTimeout(() => host.classList.remove('stamp'), 1800);
}

// Zoom avec les doigts (téléphone) : les animations des cartes (cadre qui tourne, halo, reflets) se figent,
// sinon le téléphone doit redessiner les cartes agrandies à chaque image et elles clignotent ou se coupent.
const vv = typeof window !== 'undefined' && window.visualViewport;
if (vv) {
  const upd = () => document.documentElement.classList.toggle('zoomed', vv.scale > 1.02);
  vv.addEventListener('resize', upd);
  upd();
}
