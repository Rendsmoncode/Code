// Surprise : le joueur invité « en surprise » a choisi son mot de passe sur un écran noir, puis attend.
// Quand le propriétaire la lance, son booster géant (blanc et or, à son prénom) apparaît ; il l'ouvre et
// découvre son deck, l'interface apparaît, il ouvre ses boosters de rareté puis ses boosters… et le jeu est à lui.
import { S, refreshStatus, surpriseDone, openSurprisePack } from './store.js';
import { esc, RARITIES } from './cards.js';
import { logoSVG } from './logo.js';
import { revealPending, revealList, openMany, boosterState, checkGifts } from './boosters.js';

const STEP_KEY = 'nk-surprise-step'; // étape atteinte (pour reprendre après un rechargement)
const TITLE = 'Nakama TCG';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get: () => { try { return localStorage.getItem(STEP_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(STEP_KEY, v); } catch { /* navigation privée */ } },
};

export const surpriseActive = () => ['wait', 'go'].includes(S.status?.surprise);

export async function startSurprise(show) {
  document.body.classList.add('surprise');
  document.title = '⁣'; // rien dans l'onglet non plus
  try { localStorage.setItem('nk-surprise', '1'); } catch { /* rien */ }
  const ov = document.createElement('div');
  ov.className = 'sp-ov';
  ov.innerHTML = '<div class="sp-stage"></div>';
  document.body.append(ov);
  // Un clic sur l'écran noir débloque le son pour la suite (les navigateurs l'exigent).
  ov.addEventListener('pointerdown', unlockAudio, { once: true });

  while (S.status?.surprise === 'wait') {
    await wait(1500);
    await refreshStatus().catch(() => {});
  }
  let step = store.get() || 'booster';
  if (step === 'booster') {
    await playIntro(ov);
    await giantBooster(ov);
    await revealPending('deck');
    step = 'packs';
    store.set(step);
  }
  await revealInterface(ov, show);
  if (step === 'packs') {
    await rarityPacks();
    step = 'boosters';
    store.set(step);
  }
  if (step === 'boosters') await tenBoosters(show);
  await surpriseDone().catch(() => {});
  store.set('');
  try { localStorage.removeItem('nk-surprise'); } catch { /* rien */ }
  document.body.classList.remove('surprise');
  show('home');
  checkGifts().catch(() => {});
}

// ---------- 0. la vidéo d'intro (Admin → Musiques), plein écran sur le noir ----------
// skip : bouton « Passer » ; label : texte du bouton quand le navigateur bloque le son.
export function playIntro(ov, { skip = false, label = '▶' } = {}) {
  const url = S.music?.intro?.url;
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.className = 'sp-intro-vid';
    v.src = url;
    v.playsInline = true;
    ov.append(v);
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      ov.querySelector('.sp-play')?.remove();
      ov.querySelector('.sp-skip')?.remove();
      v.classList.add('out');
      setTimeout(() => { v.remove(); resolve(); }, 500);
    };
    v.addEventListener('ended', end);
    if (skip) {
      const sk = document.createElement('button');
      sk.className = 'sp-skip';
      sk.textContent = 'Passer';
      sk.addEventListener('click', () => { v.pause(); end(); });
      ov.append(sk);
    }
    v.addEventListener('error', end);
    setTimeout(end, 40000); // sécurité
    // Son bloqué par le navigateur (page rechargée, aucun clic) : un bouton ▶ discret lance la vidéo.
    v.play().catch(() => {
      if (done) return;
      const b = document.createElement('button');
      b.className = 'sp-play';
      b.setAttribute('aria-label', 'Lancer');
      b.textContent = label;
      if (label.length > 2) b.classList.add('wide');
      ov.append(b);
      b.addEventListener('click', () => { b.remove(); v.play().catch(end); }, { once: true });
    });
  });
}

// Paquet blanc et or (booster géant et boosters de rareté).
function whitePack({ cls = '', top = '', name = '', sub = '', code = '' }) {
  return `<button class="wpack ${cls}" aria-label="Ouvrir le booster">
    <span class="wp-crimp wp-top"></span>
    <span class="wp-body">
      <span class="wp-foil"></span>
      ${top ? `<span class="wp-ed">${esc(top)}</span>` : ''}
      <span class="wp-logo">${logoSVG()}</span>
      ${name ? `<span class="wp-name" style="--len:${name.length}">${esc(name)}</span>` : ''}
      ${sub ? `<span class="wp-sub">${esc(sub)}</span>` : ''}
      ${code ? `<span class="wp-code">${esc(code)}</span>` : ''}
    </span>
    <span class="wp-crimp wp-bot"></span>
  </button>`;
}

// Le paquet se déchire (secousse, haut arraché, éclair blanc), puis la promesse se résout.
function tearOpen(ov, pack) {
  return new Promise((resolve) => {
    pack.addEventListener('click', async () => {
      if (pack.classList.contains('tear')) return;
      unlockAudio();
      pack.classList.add('tear');
      ov.classList.add('burst');
      sfx('sons/kwfx.mp3', 0.9);
      await wait(1100);
      resolve();
    });
  });
}

// ---------- 1. le booster géant ----------
async function giantBooster(ov) {
  const name = (S.status?.username || '').toUpperCase();
  const d = S.decks?.[0];
  const total = d ? Object.values(d.cards || {}).reduce((a, n) => a + n, 0) + (d.leader ? 1 : 0) : 0;
  const stage = ov.querySelector('.sp-stage');
  stage.innerHTML = `<div class="sp-glow"></div><div class="sp-rays"></div><div class="sp-sparks">${'<i></i>'.repeat(24)}</div>
    ${whitePack({ cls: 'giant', top: 'Édition personnelle', name, sub: `Ton deck${total ? ` · ${total} cartes` : ''}`, code: 'N° 001' })}
    <p class="sp-hint">Clique sur ton booster pour l'ouvrir</p>`;
  stage.querySelectorAll('.sp-sparks i').forEach((i, k) => { i.style.setProperty('--a', `${k * 15}deg`); i.style.setProperty('--d', `${(k % 6) * 0.1}s`); });
  ov.classList.add('go');
  sfx('sons/cling.mp3', 0.8, 2300);
  await tearOpen(ov, stage.querySelector('.wpack'));
  stage.innerHTML = '';
  ov.classList.remove('go', 'burst');
  ov.classList.add('veil'); // fond noir pendant la révélation des cartes
}

// ---------- 2. l'interface apparaît ----------
async function revealInterface(ov, show) {
  show('home');
  document.title = TITLE;
  ov.classList.remove('veil');
  document.documentElement.classList.remove('sp-boot');
  ov.classList.add('open');
  document.body.classList.add('sp-intro');
  await wait(1700);
  ov.remove();
  await wait(900);
  document.body.classList.remove('sp-intro');
}

// ---------- 3. un booster de chaque rareté ----------
async function rarityPacks() {
  const packs = (S.status?.packs || []).map((p, i) => ({ ...p, i })).filter((p) => !p.opened && p.n);
  if (!packs.length) return;
  await coach(`<b>${packs.length} boosters spéciaux</b> t'attendent : un de chaque rareté.`, 'Les ouvrir');
  for (const p of packs) {
    const ov = document.createElement('div');
    ov.className = 'sp-ov go sp-rar';
    ov.innerHTML = `<div class="sp-stage"><div class="sp-glow"></div>
      ${whitePack({ cls: `rar r-${p.r}`, top: 'Booster spécial', sub: RARITIES[p.r]?.label || p.r, code: RARITIES[p.r]?.short || p.r })}
      <p class="sp-hint">Clique pour l'ouvrir</p></div>`;
    document.body.append(ov);
    await tearOpen(ov, ov.querySelector('.wpack'));
    const pulls = await openSurprisePack(p.i).catch(() => []);
    ov.remove();
    if (pulls.length) await revealList(pulls);
  }
}

// ---------- 4. les boosters ----------
async function tenBoosters(show) {
  const n = Math.min(10, boosterState()?.total || 0);
  if (!n) return;
  await coach(`Et <b>${n} booster${n > 1 ? 's' : ''}</b> de plus !`, `Ouvrir mes ${n} boosters`);
  show('boosters');
  await wait(300);
  for (;;) {
    const closed = new Promise((ok) => window.addEventListener('nk:reveal-closed', (e) => ok(e.detail), { once: true }));
    openMany(n);
    const d = await closed;
    if (!d.again) break;
  }
}

// Bulle de guidage en bas de l'écran, avec un bouton.
function coach(html, label) {
  return new Promise((resolve) => {
    const c = document.createElement('div');
    c.className = 'sp-coach';
    c.innerHTML = `<p>${html}</p><button class="btn main">${esc(label)}</button>`;
    document.body.append(c);
    c.querySelector('button').addEventListener('click', () => { c.classList.add('out'); setTimeout(() => c.remove(), 300); resolve(); });
  });
}

// ---------- son ----------
let unlocked = false;
function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try { const a = new Audio('sons/cling.mp3'); a.volume = 0; a.play().then(() => a.pause()).catch(() => {}); } catch { /* rien */ }
}
function sfx(src, vol = 1, delay = 0) {
  setTimeout(() => { try { const a = new Audio(src); a.volume = vol; a.play().catch(() => {}); } catch { /* rien */ } }, delay);
}
