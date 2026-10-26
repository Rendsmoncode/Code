import { S, load, refreshStatus, currentUser, isAdmin, isOwner, signOut, loadSettings, claimForcedMatch } from './store.js';
import { esc } from './cards.js';
import { showAuth, maybeAskStarter } from './auth.js';
import { initEditor } from './editor.js';
import { createDeckBuilder } from './decks.js';
import { initPlay, inGame, startForced } from './game.js';
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

// Maintenance : tout le monde voit ce message, sauf le propriétaire (qui peut se connecter et tout régler).
function maintenanceScreen() {
  const m = S.settings.maintenance;
  document.querySelector('main').innerHTML = `<div class="panel maint"><h2>Petite pause</h2>
    <p>${esc(m.msg || 'Le jeu est en maintenance. Reviens dans quelques minutes !')}</p></div>`;
}
function banner() {
  const t = S.settings.banner || (S.settings.maintenance.on && isOwner() ? 'Maintenance activée : les joueurs ne peuvent pas jouer.' : '');
  document.querySelector('.site-banner')?.remove();
  if (t) document.querySelector('main').insertAdjacentHTML('beforebegin', `<p class="site-banner">${esc(t)}</p>`);
}

async function start() {
  await loadSettings().catch(() => {});
  if (!(await currentUser())) {
    await showAuth();
    if (S.settings.maintenance.on) document.querySelector('.auth form')?.insertAdjacentHTML('afterbegin', `<p class="msg err">${esc(S.settings.maintenance.msg || 'Le jeu est en maintenance.')}</p>`);
    return;
  }
  try { if (localStorage.getItem('nk-surprise')) document.documentElement.classList.add('sp-boot'); } catch { /* rien */ }
  await load();
  await refreshStatus();
  if (S.settings.maintenance.on && !isOwner()) { document.documentElement.classList.remove('sp-boot'); maintenanceScreen(); return; }
  banner();
  window.addEventListener('nk:settings', banner);
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

  // Partie lancée par le Game Master : vérifiée toutes les 4 secondes tant qu'on n'est pas en partie.
  const pollForced = async () => {
    if (document.hidden || inGame() || document.body.classList.contains('surprise') || document.querySelector('.fm-ov')) return;
    const m = await claimForcedMatch().catch(() => null);
    if (!m?.code) return;
    await forcedAnnounce(m.opp);
    show('play');
    startForced(m);
  };
  setInterval(pollForced, 4000);
  pollForced();

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

// Annonce plein écran avant d'être envoyé dans la partie.
function forcedAnnounce(opp) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'fm-ov';
    ov.innerHTML = `<div class="fm-box"><p class="fm-top">Le Game Master lance une partie</p>
      <p class="fm-vs"><span>${esc(S.status?.username || 'Toi')}</span><b>VS</b><span>${esc(opp || '?')}</span></p></div>`;
    document.body.append(ov);
    setTimeout(() => { ov.classList.add('out'); setTimeout(() => { ov.remove(); resolve(); }, 400); }, 2600);
  });
}

start().catch((e) => {
  document.documentElement.classList.remove('sp-boot');
  document.querySelector('main').innerHTML = `<div class="panel"><h2>Impossible de charger le jeu</h2>
    <p class="msg err">${esc(e.message)}</p><p class="muted">Vérifiez votre connexion Internet puis rechargez la page.</p></div>`;
});
