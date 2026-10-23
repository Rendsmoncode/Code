// Icônes au trait (24×24), couleur du texte.
const I = {
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  pack: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 7h12M6 17h12"/>',
  cards: '<rect x="4" y="5" width="11" height="15" rx="2"/><path d="M9 3h9a2 2 0 0 1 2 2v12"/>',
  deck: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4v17"/>',
  play: '<path d="M5 5l14 14M19 5L5 19"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  out: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
};
export const icon = (k) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;
