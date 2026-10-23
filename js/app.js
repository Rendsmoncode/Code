import { S, load, refreshStatus, currentUser, isAdmin, signOut } from './store.js';
import { esc } from './cards.js';
import { showAuth, maybeAskStarter } from './auth.js';
import { initEditor } from './editor.js';
import { createDeckBuilder } from './decks.js';
import { initPlay } from './game.js';
import { initBoosters, initCollection } from './boosters.js';
import { initAdmin } from './admin.js';
import { openSettings } from './settings.js';
import { initCredits } from './credits.js';

const tabs = document.querySelectorAll('[data-tab]');

function show(name) {
  if (!document.querySelector(`[data-tab=${name}]:not([hidden])`)) name = 'boosters';
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  document.querySelectorAll('.tab').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  try { localStorage.setItem('optcgm-tab', name); } catch { /* stockage indisponible */ }
}

tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));

async function start() {
  if (!(await currentUser())) { showAuth(); return; }
  await load();
  await refreshStatus();
  const admin = isAdmin();
  document.querySelectorAll('.admin-only').forEach((t) => { t.hidden = !admin; });
  document.querySelector('.who').innerHTML = `<span>${esc(S.status.username)}</span>
    ${admin ? `<span class="badge ok">${S.status.role === 'owner' ? 'Propriétaire' : 'Admin'}</span>` : ''}
    <button class="btn ghost small settings-btn" title="Paramètres" aria-label="Paramètres">⚙</button>
    <button class="btn ghost small logout">Déconnexion</button>`;
  document.querySelector('.logout').addEventListener('click', signOut);
  document.querySelector('.settings-btn').addEventListener('click', openSettings);

  initBoosters();
  initCollection();
  createDeckBuilder({
    el: document.getElementById('tab-decks'), kind: 'decks', owned: true, title: 'Mes decks',
    intro: 'Vous ne pouvez utiliser que les cartes que vous possédez.',
  });
  initPlay();
  initCredits();
  if (admin) { initEditor(); initAdmin(); }

  let first = 'boosters';
  try { first = localStorage.getItem('optcgm-tab') || first; } catch { /* rien */ }
  if (new URLSearchParams(location.search).get('join')) first = 'play';
  show(first);
  maybeAskStarter();
}

start().catch((e) => {
  document.querySelector('main').innerHTML = `<div class="panel"><h2>Impossible de charger le jeu</h2>
    <p class="msg err">${esc(e.message)}</p><p class="muted">Vérifiez votre connexion Internet puis rechargez la page.</p></div>`;
});
