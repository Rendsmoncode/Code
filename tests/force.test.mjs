// Teste « Lancer une partie » du Game Master : deux joueurs sur leur accueil sont envoyés directement dans la partie (mode local).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { makeMock } from './mock-supabase.mjs';

const SITE = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const mock = makeMock();
const C = (id, d) => { mock.st.cards[id] = { id, rarity: 'C', in_boosters: true, data: { name: id, colors: ['rouge'], traits: 'Équipage', attribute: 'Frappe', counter: 1000, effects: [], ...d } }; };
C('Leader', { type: 'leader', life: 5, power: 5000 });
const deck = {};
for (let i = 0; i < 13; i++) { C('P' + i, { type: 'character', cost: 1, power: 1000 }); deck['P' + i] = 4; }
deck.P12 = 2;
mock.st.starters.s1 = { id: 's1', name: 'Test', leader: 'Leader', cards: deck };
for (const n of ['nico', 'mathieu']) mock.st.invites['t-' + n] = { token: 't-' + n, username: n, boosters: 0, starter_id: 's1' };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1300, height: 850 } });
await ctx.route(/supabase\.co/, mock.handle);
await ctx.route(/unpkg\.com/, (r) => r.abort());
const errs = [];
const results = [];
const check = (label, ok, info = '') => results.push([ok ? 'OK ' : 'ÉCHEC', label, info]);
// Un même navigateur (pour que le mode local relie les onglets), mais une session par onglet :
// chaque onglet range ses données sous ses propres clés.
const mk = async (n) => {
  const p = await ctx.newPage();
  await p.addInitScript((suf) => {
    for (const fn of ['getItem', 'setItem', 'removeItem']) {
      const o = Storage.prototype[fn];
      Storage.prototype[fn] = function (key, ...a) { return o.call(this, `${key}${suf}`, ...a); };
    }
  }, '-' + n);
  p.on('pageerror', (e) => errs.push(n + ': ' + e.message)); p.on('dialog', (d) => d.accept());
  return p;
};

const GM = await mk('gm');
await GM.goto(SITE + '?test=1');
await GM.click('[data-mode=up]'); await GM.fill('#au-user', 'ayoub'); await GM.fill('#au-pass', 'secret1'); await GM.fill('#au-pass2', 'secret1');
await GM.click('.auth .btn.primary'); await GM.waitForSelector('.starter'); await GM.click('.starter'); await GM.waitForTimeout(600);

const join = async (n) => {
  const p = await mk(n);
  await p.goto(`${SITE}?test=1&invite=t-${n}`);
  await p.waitForSelector('#au-pass'); await p.fill('#au-pass', 'motdepasse'); await p.fill('#au-pass2', 'motdepasse');
  await p.click('.auth .btn.primary'); await p.waitForSelector('.who .me');
  return p;
};
const N = await join('nico');
const M = await join('mathieu');
await N.waitForTimeout(500);
check('les deux joueurs sont sur l\'accueil', (await N.getAttribute('body', 'data-tab')) === 'home' && (await M.getAttribute('body', 'data-tab')) === 'home');

// Le Game Master lance la partie nico (hôte) contre mathieu
await GM.evaluate(() => document.querySelector('[data-tab=gm]').click()); await GM.waitForTimeout(400);
await GM.waitForSelector('.gf-p option[value=nico]', { state: 'attached' });
await GM.selectOption('.gf-p[data-i="0"]', 'nico'); await GM.waitForTimeout(300);
const decks = await GM.$$eval('.gf-d[data-i="0"] option', (o) => o.map((x) => x.textContent));
check('le GM voit les decks du joueur', decks.some((t) => t.includes('Test')), decks.join(', '));
await GM.selectOption('.gf-p[data-i="1"]', 'mathieu');
await GM.selectOption('.gf-mode', 'local');
await GM.click('[data-gf=go]'); await GM.waitForTimeout(300);
if (process.env.SHOTDIR) await (await GM.$('.gm-live')).screenshot({ path: `${process.env.SHOTDIR}/gm.png` });
const gmMsg = await GM.textContent('.gf-msg');
check('partie lancée côté GM', /lancée/.test(gmMsg), gmMsg);

// Les deux joueurs voient l'annonce, puis arrivent dans la partie
await N.waitForSelector('.fm-ov', { timeout: 8000 });
if (process.env.SHOTDIR) { await N.waitForTimeout(1200); await N.screenshot({ path: `${process.env.SHOTDIR}/annonce.png` }); }
const vs = await N.textContent('.fm-ov');
check('annonce « nico VS mathieu »', /nico.*VS.*mathieu/is.test(vs), vs.replace(/\s+/g, ' '));
await M.waitForSelector('.fm-ov', { timeout: 8000 });
const connected = (p) => p.waitForFunction(() => window.__optcg?.G()?.connected && window.__optcg.G().oppHello !== false, null, { timeout: 20000 }).then(() => true).catch(() => false);
const [cn, cm] = await Promise.all([connected(N), connected(M)]);
check('les deux joueurs sont connectés dans la même partie', cn && cm);
await N.waitForTimeout(800);
const info = async (p) => p.evaluate(() => ({ role: __optcg.G().role, opp: __optcg.G().oppName, tab: document.body.dataset.tab, phase: __optcg.G().phase }));
const iN = await info(N); const iM = await info(M);
check('nico est l\'hôte, mathieu l\'invité', iN.role === 'host' && iM.role === 'guest', JSON.stringify([iN, iM]));
check('chacun voit le bon adversaire', iN.opp === 'mathieu' && iM.opp === 'nico', `${iN.opp} / ${iM.opp}`);
check('onglet Jouer affiché, partie commencée', iN.tab === 'play' && iM.tab === 'play' && iN.phase !== 'hello', JSON.stringify([iN.tab, iN.phase]));

// Le GM voit qu'ils sont arrivés
await GM.waitForTimeout(10500);
const list = await GM.textContent('.gf-list');
if (process.env.SHOTDIR) { await (await GM.$('.gm-live')).screenshot({ path: `${process.env.SHOTDIR}/gm2.png` }); await N.screenshot({ path: `${process.env.SHOTDIR}/partie.png` }); }
check('le GM voit « arrivé » pour les deux', (list.match(/arrivé/g) || []).length === 2, list.replace(/\s+/g, ' ').slice(0, 120));

// Relancer pendant qu'ils jouent ne les arrache pas à leur partie
await GM.click('[data-gf=go]'); await N.waitForTimeout(5000);
check('pas de nouvelle annonce pendant une partie', !(await N.$('.fm-ov')) && (await info(N)).opp === 'mathieu');
if (process.env.SHOT) { await N.screenshot({ path: process.env.SHOT }); }

for (const r of results) console.log(r.join(' | '));
console.log('total', results.length, 'échecs', results.filter((r) => r[0] !== 'OK ').length);
console.log('ERREURS', JSON.stringify(errs));
await b.close();
