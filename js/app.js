import { load } from './store.js';
import { initEditor } from './editor.js';
import { initDecks } from './decks.js';
import { initPlay } from './game.js';

const tabs = document.querySelectorAll('[data-tab]');

function show(name) {
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  document.querySelectorAll('.tab').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  try { localStorage.setItem('optcgm-tab', name); } catch { /* stockage indisponible */ }
}

tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));

load().then(() => {
  initEditor();
  initDecks();
  initPlay();
  let start = 'cards';
  try { start = localStorage.getItem('optcgm-tab') || 'cards'; } catch { /* rien */ }
  if (new URLSearchParams(location.search).get('join')) start = 'play';
  show(start);
});
