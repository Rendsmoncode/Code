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

const hasWord = (card, words) => {
  const t = `${card?.effect || ''}`.toLowerCase();
  return words.some((w) => t.includes(w));
};
export const isBlocker = (c) => hasWord(c, ['[bloqueur]', '[blocker]']);
export const hasRush = (c) => hasWord(c, ['[initiative]', '[rush]']);
export const hasDoubleAttack = (c) => hasWord(c, ['[double attaque]', '[double attack]']);
export const hasBanish = (c) => hasWord(c, ['[exil]', '[banish]']);

// Une carte a 1 ou 2 attributs, stockés dans `attribute` sous la forme « Frappe / Tranchant ».
export const attributesOf = (card) => String(card?.attribute || '').split('/').map((a) => a.trim()).filter(Boolean).slice(0, 2);

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

// o.power : puissance affichée (si modifiée), o.cls : classes en plus, o.attrs : attributs HTML en plus.
export function cardHTML(card, o = {}) {
  if (!card) return `<div class="card back ${o.cls || ''}" ${o.attrs || ''}><div class="frame"><div class="back-logo">OPTCG<small>Maison</small></div></div></div>`;
  const t = card.type;
  const fighter = t === 'leader' || t === 'character';
  const cost = t === 'leader'
    ? `<div class="cost life" title="Vie"><span>${esc(card.life)}</span></div>`
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
  const attr = fighter && attrs.length ? `<div class="attr">${attrs.map((a) => `<span>${esc(a)}</span>`).join('')}</div>` : '';
  const trig = card.trigger && t !== 'leader'
    ? `<div class="trg"><span class="kw trig">Déclenchement</span> ${fmtEffect(card.trigger)}</div>` : '';
  const r = RARITIES[card.rarity] ? card.rarity : 'C';
  const hex = (card.colors?.length ? card.colors : ['noir']).map((c) => COLORS[c]?.hex || '#555');
  const len = (card.name || '').length;
  const art = card.image ? ` style="background-image:url('${card.image}')"` : '';
  return `<div class="card t-${t} r-${r} ${o.cls || ''}" style="--c1:${hex[0]};--c2:${hex[1] || hex[0]}" ${o.attrs || ''}>
    <div class="frame">
      <div class="art${card.image ? '' : ' empty'}"${art}></div>
      <div class="shade"></div>
      ${cost}${pow}${ctr}${attr}
      <div class="nm${len > 18 ? ' xlong' : len > 13 ? ' long' : ''}"><span>${esc(card.name || 'Sans nom')}</span></div>
      <div class="info">
        <div class="tl">${TYPES[t] || ''}${card.traits ? ' · ' + esc(card.traits) : ''}</div>
        ${card.effect ? `<div class="fx">${fmtEffect(card.effect)}</div>` : ''}
        ${trig}
      </div>
      <div class="rar" title="${RARITIES[r].label}">${RARITIES[r].short}</div>
      <div class="foil"></div>
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
