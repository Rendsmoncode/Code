// Surprise : le joueur invité « en surprise » attend devant un écran noir. Quand le propriétaire la lance,
// son booster géant (à son prénom) arrive ; il l'ouvre et découvre son deck, l'interface apparaît, il ouvre
// ses 10 boosters, découvre le gameplay, choisit son mot de passe… et le jeu complet est à lui.
import { S, refreshStatus, surpriseDone, setPassword } from './store.js';
import { esc, cardHTML } from './cards.js';
import { logoSVG } from './logo.js';
import { revealPending, openMany, boosterState, checkGifts } from './boosters.js';
import { playKeyword } from './kwfx.js';

const STEP_KEY = 'nk-surprise-step'; // étape atteinte (pour reprendre après un rechargement)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get: () => { try { return localStorage.getItem(STEP_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(STEP_KEY, v); } catch { /* navigation privée */ } },
};
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

export const surpriseActive = () => ['wait', 'go'].includes(S.status?.surprise);

export async function startSurprise(show) {
  document.body.classList.add('surprise');
  try { localStorage.setItem('nk-surprise', '1'); } catch { /* rien */ }
  const ov = document.createElement('div');
  ov.className = 'sp-ov';
  ov.innerHTML = '<div class="sp-stage"></div>';
  document.body.append(ov);
  // Un toucher sur l'écran noir débloque le son pour la suite (les navigateurs l'exigent).
  ov.addEventListener('pointerdown', unlockAudio, { once: true });

  while (S.status?.surprise === 'wait') {
    await wait(1500);
    await refreshStatus().catch(() => {});
  }
  let step = store.get() || 'booster';
  if (step === 'booster') {
    await giantBooster(ov);
    const had = await revealPending();
    if (!had) await wait(200);
    step = 'ui';
    store.set(step);
  }
  await revealInterface(ov, show);
  if (step === 'ui' || step === 'boosters') {
    store.set('boosters');
    await tenBoosters(show);
  }
  store.set('tuto');
  await tutorial();
  store.set('pass');
  await finalStep();
  await surpriseDone().catch(() => {});
  store.set('');
  try { localStorage.removeItem('nk-surprise'); } catch { /* rien */ }
  document.body.classList.remove('surprise');
  show('home');
  checkGifts().catch(() => {});
}

// ---------- 1. le booster géant ----------
function giantBooster(ov) {
  const name = (S.status?.username || '').toUpperCase();
  const d = S.decks?.[0];
  const total = d ? Object.values(d.cards || {}).reduce((a, n) => a + n, 0) + (d.leader ? 1 : 0) : 0;
  const stage = ov.querySelector('.sp-stage');
  stage.innerHTML = `<div class="sp-glow"></div><div class="sp-rays"></div>
    <button class="gpack" aria-label="Ouvrir ton booster">
      <span class="gp-crimp gp-top"></span>
      <span class="gp-body">
        <span class="gp-foil"></span>
        <span class="gp-ed">Édition personnelle</span>
        <span class="gp-logo">${logoSVG()}</span>
        <span class="gp-name" style="--len:${name.length}">${esc(name)}</span>
        <span class="gp-sub">Ton deck${total ? ` · ${total} cartes` : ''}</span>
        <span class="gp-code">N° 001</span>
      </span>
      <span class="gp-crimp gp-bot"></span>
    </button>
    <p class="sp-hint">Touche ton booster pour l'ouvrir</p>`;
  ov.classList.add('go');
  sfx('sons/cling.mp3', 0.8, 1900);
  return new Promise((resolve) => {
    const pack = stage.querySelector('.gpack');
    pack.addEventListener('click', async () => {
      if (pack.classList.contains('tear')) return;
      unlockAudio();
      pack.classList.add('tear');
      ov.classList.add('burst');
      sfx('sons/kwfx.mp3', 0.9);
      await wait(1100);
      stage.innerHTML = '';
      ov.classList.remove('go', 'burst');
      ov.classList.add('veil'); // fond noir pendant la révélation des cartes
      resolve();
    }, { once: false });
  });
}

// ---------- 2. l'interface apparaît ----------
async function revealInterface(ov, show) {
  show('home');
  ov.classList.remove('veil');
  document.documentElement.classList.remove('sp-boot');
  ov.classList.add('open');
  document.body.classList.add('sp-intro');
  await wait(1700);
  ov.remove();
  await wait(900);
  document.body.classList.remove('sp-intro');
}

// ---------- 3. les 10 boosters ----------
async function tenBoosters(show) {
  const n = Math.min(10, boosterState()?.total || 0);
  if (!n) return;
  await coach(`<b>${n} booster${n > 1 ? 's' : ''}</b> t'attend${n > 1 ? 'ent' : ''} !`, `Ouvrir mes ${n} boosters`);
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

// ---------- 4. découverte du gameplay ----------
function myLeader() {
  const d = S.decks?.[0];
  return d ? S.byId[d.leader] : null;
}
function slides() {
  const leader = myLeader();
  const kwBtn = (k, t) => `<button class="btn small sp-kw" data-kw="${k}">${t}</button>`;
  return [
    { t: 'Le but du jeu', h: '<p>Fais tomber les <b>Vies</b> du Leader adverse à zéro… puis touche-le <b>une dernière fois</b>. C\'est gagné.</p><p class="muted">Chaque joueur commence avec 5 cartes en main.</p>' },
    { t: 'Ton Leader', h: `${leader ? `<div class="sp-card">${cardHTML(leader)}</div>` : ''}<p>Il reste toujours en jeu. Ses <b>Vies</b> sont des cartes face cachée : à chaque coup reçu, une Vie part dans ta main.</p>` },
    { t: 'Les DON!!', h: '<p>Ta ressource : <b>1 DON!!</b> au premier tour, puis <b>2 par tour</b> (10 au total).</p><p>Ils paient le <b>coût</b> de tes cartes… ou s\'attachent à un Personnage ou à ton Leader : <b>+1000 de puissance</b> chacun pendant ton tour.</p>' },
    { t: 'Ton tour', h: '<ol class="sp-list"><li>Tu pioches 1 carte</li><li>Tu reçois tes DON!!</li><li>Tu joues des <b>Personnages</b>, <b>Événements</b> et <b>Lieux</b></li><li>Tu <b>attaques</b></li><li>Fin du tour</li></ol>' },
    { t: 'Attaquer', h: '<p>L\'attaquant s\'<b>épuise</b> (il se couche). Il vise le <b>Leader adverse</b> ou un <b>Personnage épuisé</b>.</p><p>Puissance <b>égale ou supérieure</b> : ça touche. Un Personnage touché est mis KO ; un Leader touché perd une Vie.</p><p class="muted">Un Personnage joué ce tour-ci doit attendre le suivant… sauf s\'il a [Initiative].</p>' },
    { t: 'Se défendre', h: '<p><b>[Bloqueur]</b> : un de tes Personnages prend le coup à la place.</p><p><b>Contre</b> : défausse des cartes de ta main pour ajouter leur valeur de Contre (+1000, +2000…).</p><p><b>Déclenchement</b> : quand tu perds une Vie, elle peut s\'activer gratuitement.</p>' },
    { t: 'Les mots-clés', h: `<p>Certains moments ont droit à leur annonce. Touche pour voir :</p><div class="row-btns sp-kws">${kwBtn('blocker', 'Bloqueur')}${kwBtn('double', 'Double attaque')}${kwBtn('banish', 'Exil')}${kwBtn('rush', 'Initiative')}</div><p class="muted">Double attaque : 2 Vies d'un coup · Exil : la Vie part à la défausse, sans Déclenchement.</p>` },
    { t: 'Ton deck', h: `<p>Ton deck a été construit <b>rien que pour toi</b>. Il est déjà prêt dans l'onglet <b>Decks</b>.</p><p>Pour jouer : onglet <b>Jouer</b>, crée une partie et envoie le code à ton adversaire.</p><p class="sp-big">À toi de jouer, ${esc(cap(S.status?.username || ''))} !</p>` },
  ];
}
function tutorial() {
  const list = slides();
  let i = 0;
  return new Promise((resolve) => {
    const o = document.createElement('div');
    o.className = 'overlay sp-tuto';
    document.body.append(o);
    const render = () => {
      const s = list[i];
      o.innerHTML = `<div class="dialog sp-slide" role="dialog" aria-label="${esc(s.t)}">
        <div class="sp-dots">${list.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
        <h3>${esc(s.t)}</h3><div class="sp-body">${s.h}</div>
        <div class="row-btns">${i ? '<button class="btn ghost" data-go="-1">Retour</button>' : ''}
          <button class="btn main" data-go="1">${i === list.length - 1 ? 'Terminer' : 'Suivant'}</button></div></div>`;
    };
    render();
    o.addEventListener('click', (e) => {
      const kw = e.target.closest('[data-kw]')?.dataset.kw;
      if (kw) { playKeyword(kw, S.music); return; }
      const go = e.target.closest('[data-go]')?.dataset.go;
      if (!go) return;
      i += Number(go);
      if (i >= list.length) { o.remove(); resolve(); return; }
      render();
    });
  });
}

// ---------- 5. le mot de passe ----------
function finalStep() {
  return new Promise((resolve) => {
    const o = document.createElement('div');
    o.className = 'overlay';
    o.innerHTML = `<form class="dialog sp-pass" autocomplete="on">
      <h3>Dernière chose : ton mot de passe</h3>
      <p class="muted">Pour te reconnecter plus tard, sur ce téléphone ou un autre appareil. Ton pseudo : <b>${esc(S.status?.username || '')}</b></p>
      <input type="text" name="username" autocomplete="username" value="${esc(S.status?.username || '')}" hidden>
      <div class="field"><label for="sp-p1">Mot de passe</label><input id="sp-p1" type="password" minlength="6" autocomplete="new-password" required></div>
      <div class="field"><label for="sp-p2">Confirmer</label><input id="sp-p2" type="password" minlength="6" autocomplete="new-password" required></div>
      <p class="msg err sp-err" role="alert"></p>
      <div class="row-btns"><button type="button" class="btn ghost" data-later>Plus tard</button><button class="btn main">C'est parti !</button></div>
    </form>`;
    document.body.append(o);
    const f = o.querySelector('form');
    o.querySelector('[data-later]').addEventListener('click', () => { o.remove(); resolve(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = f.querySelector('#sp-p1').value;
      if (p1 !== f.querySelector('#sp-p2').value) { f.querySelector('.sp-err').textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
      try {
        await setPassword(p1);
        try { localStorage.removeItem('nk-auto-pass'); } catch { /* rien */ }
        o.remove();
        resolve();
      } catch (err) { f.querySelector('.sp-err').textContent = err.message; }
    });
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
