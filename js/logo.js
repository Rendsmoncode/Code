// Logo Nakama : chapeau de paille plein, X derrière le nom. En SVG pour suivre la couleur du texte (currentColor).
const CROWN = 'M31 60 C31 46 36 37 50 37 C64 37 69 46 69 60 Z';
const BRIM = '<ellipse cx="50" cy="62" rx="42" ry="8"/>';
// Ruban et base de la calotte, découpés en creux.
const GAPS = '<path d="M29 52 C40 55.5 60 55.5 71 52" stroke-width="3.4"/><path d="M30 60 C40 63.5 60 63.5 70 60" stroke-width="2.4"/>';
const WORD = 'x="51" y="84" text-anchor="middle" font-family="Archivo Black, sans-serif" font-size="13.5" textLength="68" lengthAdjust="spacing"';

let n = 0; // identifiants de masque uniques dans la page

function hat(id, tr, col = 'currentColor', band = '') {
  return `<g transform="${tr}"><mask id="${id}"><rect x="-50" y="-50" width="200" height="200" fill="#fff"/><g stroke="#000" fill="none" stroke-linecap="round">${GAPS}</g></mask><g mask="url(#${id})" fill="${col}"><path d="${CROWN}"/>${BRIM}</g>${band ? `<path d="M30.6 51.2 C40 54.4 60 54.4 69.4 51.2 L69.1 49 C60 52.2 40 52.2 30.9 49 Z" fill="${band}"/>` : ''}</g>`;
}

// Logo complet (chapeau + NAKAMA + X).
export function logoSVG(cls = '') {
  const k = 'nk' + (++n);
  return `<svg class="${cls}" viewBox="8 20 84 81" role="img" aria-label="Nakama TCG"><mask id="${k}w"><rect x="-50" y="-50" width="200" height="200" fill="#fff"/><text ${WORD} fill="#000" stroke="#000" stroke-width="5" stroke-linejoin="round">NAKAMA</text></mask>${hat(k + 'h', 'translate(50 38) scale(.95) translate(-50 -53.5)')}<path d="M20 62 L82 96 M82 62 L20 96" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none" mask="url(#${k}w)"/><text ${WORD} fill="currentColor">NAKAMA</text></svg>`;
}

// Chapeau seul en couleurs (paille, ruban rouge) : icône d'onglet.
export function iconSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 34 88 42">${hat('i', '', '#e9c46a', '#d62828')}</svg>`;
}
