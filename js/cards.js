// Modèle de carte, constantes du jeu et rendu HTML d'une carte.

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
  UC: { label: 'Peu commune', short: 'PC' },
  R: { label: 'Rare', short: 'R' },
  UR: { label: 'Ultra rare', short: 'UR' },
  L: { label: 'Légendaire', short: 'L' },
  S: { label: 'Introuvable', short: '★' },
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

const hasWord = (card, words) => {
  const t = `${card?.effect || ''}`.toLowerCase();
  return words.some((w) => t.includes(w));
};
export const isBlocker = (c) => hasWord(c, ['[bloqueur]', '[blocker]']);
export const hasRush = (c) => hasWord(c, ['[initiative]', '[rush]']);
export const hasDoubleAttack = (c) => hasWord(c, ['[double attaque]', '[double attack]']);
export const hasBanish = (c) => hasWord(c, ['[exil]', '[banish]']);

export function newCard() {
  return {
    id: uid(), code: '', name: '', type: 'character', colors: ['rouge'],
    cost: 1, life: 5, power: 1000, counter: 1000, attribute: 'Frappe',
    traits: '', effect: '', trigger: '', image: '', rarity: 'C', inBoosters: true,
  };
}

export function fmtEffect(txt) {
  return esc(txt)
    .replace(/\[([^\]]+)\]/g, '<span class="kw">$1</span>')
    .replace(/\n/g, '<br>');
}

function colorBg(colors) {
  const hex = (colors?.length ? colors : ['noir']).map((c) => COLORS[c]?.hex || '#555');
  return hex.length > 1 ? `linear-gradient(135deg, ${hex[0]} 0 50%, ${hex[1]} 50% 100%)` : hex[0];
}

// o.power : puissance affichée (si modifiée), o.cls : classes en plus, o.attrs : attributs HTML en plus.
export function cardHTML(card, o = {}) {
  if (!card) return `<div class="card back ${o.cls || ''}" ${o.attrs || ''}><div class="frame"></div></div>`;
  const t = card.type;
  const corner = t === 'leader'
    ? `<div class="corner life" title="Vie">${esc(card.life)}</div>`
    : `<div class="corner cost" title="Coût">${esc(card.cost ?? 0)}</div>`;
  let pow = '';
  if (t === 'leader' || t === 'character') {
    const base = Number(card.power) || 0;
    const shown = o.power ?? base;
    const diff = shown > base ? ' up' : shown < base ? ' down' : '';
    pow = `<div class="pow${diff}" title="Puissance">${shown}</div>`;
  }
  const ctr = t === 'character' && Number(card.counter) > 0
    ? `<div class="ctr" title="Contre">+${esc(card.counter)}</div>` : '';
  const attr = (t === 'leader' || t === 'character') && card.attribute
    ? `<div class="attr">${esc(card.attribute)}</div>` : '';
  const trig = card.trigger && t !== 'leader'
    ? `<div class="trg"><span class="kw trig">Déclenchement</span> ${fmtEffect(card.trigger)}</div>` : '';
  const rar = RARITIES[card.rarity] ? `<div class="rar r-${card.rarity}" title="${RARITIES[card.rarity].label}">${RARITIES[card.rarity].short}</div>` : '';
  const art = card.image ? ` style="background-image:url('${card.image}')"` : '';
  return `<div class="card t-${t} r-${card.rarity || 'C'} ${o.cls || ''}" style="--bg:${colorBg(card.colors)}" ${o.attrs || ''}>
    <div class="frame">
      <div class="art${card.image ? '' : ' empty'}"${art}></div>
      ${corner}${pow}${ctr}${attr}${rar}
      <div class="info">
        <div class="nm">${esc(card.name || 'Sans nom')}</div>
        <div class="tl">${TYPES[t] || ''}${card.traits ? ' · ' + esc(card.traits) : ''}${card.code ? ' · ' + esc(card.code) : ''}</div>
        <div class="fx">${fmtEffect(card.effect)}</div>
        ${trig}
      </div>
    </div>
  </div>`;
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
