import { S, load, refreshStatus, currentUser, isAdmin, isOwner, signOut } from './store.js';
import { esc } from './cards.js';
import { showAuth, maybeAskStarter } from './auth.js';
import { initEditor } from './editor.js';
import { createDeckBuilder } from './decks.js';
import { initPlay } from './game.js';
import { initBoosters, initCollection, checkGifts } from './boosters.js';
import { initAdmin } from './admin.js';
import { openSettings } from './settings.js';
import { initCredits } from './credits.js';
import { logoSVG } from './logo.js';
import { icon } from './icons.js';
import { initHome } from './home.js';
import { initAchievements } from './achievements.js';
import { initGM } from './gm.js';
import { surpriseActive, startSurprise } from './surprise.js';

document.querySelector('.top .brand').innerHTML = logoSVG('', true);
document.querySelectorAll('[data-ico]').forEach((b) => b.insertAdjacentHTML('afterbegin', icon(b.dataset.ico)));

// Menu (avatar sur ordinateur, « Plus » sur téléphone).
const menu = document.querySelector('.top .menu');
const toggleMenu = (open = menu.hidden) => { menu.hidden = !open; };
document.addEventListener('click', (e) => {
  if (e.target.closest('.menu-btn')) { toggleMenu(); return; }
  if (!e.target.closest('.menu')) toggleMenu(false);
  else if (e.target.closest('button')) toggleMenu(false);
});

const tabs = document.querySelectorAll('[data-tab]');

function show(name) {
  if (!document.querySelector(`[data-tab=${name}]:not([hidden])`)) name = 'home';
  document.body.dataset.tab = name;
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  document.querySelectorAll('.tab').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
}

tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));

async function start() {
  if (!(await currentUser())) { showAuth(); return; }
  try { if (localStorage.getItem('nk-surprise')) document.documentElement.classList.add('sp-boot'); } catch { /* rien */ }
  await load();
  await refreshStatus();
  const admin = isAdmin();
  document.querySelectorAll('.admin-only').forEach((t) => { t.hidden = !admin; });
  document.querySelectorAll('.owner-only').forEach((t) => { t.hidden = !isOwner(); });
  document.querySelector('.who').innerHTML = `<button class="me menu-btn" aria-label="Menu"><span>${esc(S.status.username)}</span>
    ${admin ? `<span class="badge ok">${S.status.role === 'owner' ? 'Propriétaire' : 'Admin'}</span>` : ''}<span class="av">${icon('user')}</span></button>`;
  document.querySelector('.logout').addEventListener('click', signOut);
  document.querySelector('.settings-btn').addEventListener('click', openSettings);

  initBoosters();
  initHome(show);
  initCollection();
  createDeckBuilder({
    el: document.getElementById('tab-decks'), kind: 'decks', owned: true, title: 'Mes decks',
    intro: 'Vous ne pouvez utiliser que les cartes que vous possédez.',
  });
  initPlay();
  initCredits();
  initAchievements();
  if (admin) { initEditor(); initAdmin(); }
  if (isOwner()) initGM();

  // Surprise : écran noir jusqu'au lancement, puis le booster géant (voir surprise.js).
  if (surpriseActive()) { startSurprise(show); return; }
  document.documentElement.classList.remove('sp-boot');
  document.title = 'Nakama TCG';
  try { localStorage.removeItem('nk-surprise'); } catch { /* rien */ }
  let first = 'home';
  if (new URLSearchParams(location.search).get('join')) first = 'play';
  show(first);
  maybeAskStarter();
  checkGifts().catch(() => {});
}

start().catch((e) => {
  document.documentElement.classList.remove('sp-boot');
  document.querySelector('main').innerHTML = `<div class="panel"><h2>Impossible de charger le jeu</h2>
    <p class="msg err">${esc(e.message)}</p><p class="muted">Vérifiez votre connexion Internet puis rechargez la page.</p></div>`;
});
