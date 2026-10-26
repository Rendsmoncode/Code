// Teste chaque action, coût, condition et déclencheur d'effet dans une partie à deux onglets (mode local, ?test=1).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
const SITE = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
import { makeMock } from './mock-supabase.mjs';
const mock = makeMock();
const C = (id, d) => { mock.st.cards[id] = { id, rarity: 'C', in_boosters: true, data: { name: id, colors: ['rouge'], traits: 'Équipage', attribute: 'Frappe', counter: 1000, effects: [], ...d } }; };
C('Leader', { type: 'leader', life: 5, power: 5000 });
for (let i = 0; i < 13; i++) C('P' + i, { type: 'character', cost: 1 + (i % 4), power: 1000 + 1000 * (i % 5) });
C('Fort', { type: 'character', cost: 4, power: 6000 });
C('Aura', { type: 'character', cost: 2, power: 3000, effects: [{ when: 'yourTurn', conds: [], costs: [], actions: [{ k: 'power', t: { side: 'opp', who: 'allChars', n: 1 }, amount: -1000, dur: 'turn' }] }] });
const draw1 = [{ k: 'draw', n: 1 }];
C('TKO', { type: 'character', cost: 1, power: 1000, effects: [{ when: 'onKO', conds: [], costs: [], actions: draw1 }] });
C('TEnd', { type: 'character', cost: 1, power: 1000, effects: [{ when: 'endOfTurn', conds: [], costs: [], actions: draw1 }] });
C('TStart', { type: 'character', cost: 1, power: 1000, effects: [{ when: 'startOfTurn', conds: [], costs: [], actions: draw1 }] });
C('TPC', { type: 'character', cost: 1, power: 1000, effects: [{ when: 'onPlayChar', conds: [], costs: [], actions: draw1 }] });
C('Phoenix', { type: 'character', cost: 3, power: 4000, effects: [{ when: 'onKO', conds: [], costs: [], actions: [{ k: 'playSelf', from: 'trash' }] }] });
C('Gros', { type: 'character', cost: 8, power: 9000 });
C('SaboFx', { type: 'character', cost: 1, power: 5000, effects: [
  { when: 'static', conds: [{ k: 'lifeGE', n: 4 }], costs: [], actions: [{ k: 'power', t: { side: 'mine', who: 'self', n: 1 }, amount: -1000, dur: 'turn' }] },
  { when: 'static', conds: [{ k: 'donAttached', n: 1 }, { k: 'charsGE', n: 1, f: { minCost: 8 } }], costs: [], actions: [{ k: 'power', t: { side: 'mine', who: 'leaderAndAll', n: 1 }, amount: 1000, dur: 'turn' }] },
] });
C('Moyen', { type: 'character', cost: 5, power: 6000 });
const deck = {}; for (let i = 0; i < 12; i++) deck['P' + i] = 4; deck.Fort = 1; deck.Aura = 1; deck.Phoenix = 1; deck.Gros = 1; deck.Moyen = 1; delete deck.P10; delete deck.P11; deck.SaboFx = 1; deck.TKO = 1; deck.TEnd = 1; deck.TStart = 1; deck.TPC = 1;
mock.st.starters.s1 = { id: 's1', name: 'Test', leader: 'Leader', cards: deck };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route(/supabase\.co/, mock.handle); await ctx.route(/unpkg\.com/, (r) => r.abort());
const errs = [];
// Résolution automatique des fenêtres de choix dans les deux onglets.
await ctx.addInitScript(() => setInterval(() => {
  const o = document.querySelector('.overlay .dialog'); if (!o) return;
  const ok = o.querySelector('[data-ok]');
  const picks = [...o.querySelectorAll('.grid-card.pick:not(.off)')];
  if (picks.length && ok) {
    if (!o.querySelector('.grid-card.pick.on')) { picks[0].click(); return; }
    if (!ok.disabled) { ok.click(); return; }
    picks.find((p) => !p.classList.contains('on'))?.click(); return;
  }
  if (ok) { ok.click(); return; }
  o.querySelector('.btn.primary')?.click();
}, 120));
const mk = async (n) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(n + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; };
const A = await mk('A');
await A.goto(SITE + '?test=1');
await A.click('[data-mode=up]'); await A.fill('#au-user', 'ayoub'); await A.fill('#au-pass', 'secret1'); await A.fill('#au-pass2', 'secret1');
await A.click('.auth .btn.primary'); await A.waitForSelector('.starter'); await A.click('.starter'); await A.waitForTimeout(800);
const results = []; const check = (l, ok, i = '') => results.push([ok ? 'OK ' : 'ÉCHEC', l, i]);
// Le Game Master règle les paramètres
await A.evaluate(() => document.querySelector('[data-tab=gm]').click()); await A.waitForSelector('.gs-set'); await A.waitForTimeout(300);
const setK = (k, v) => A.fill(`[data-k="${k}"]`, String(v));
await setK('game.hand', 7); await setK('game.life_bonus', 1); await A.uncheck('[data-k="game.mulligan"]');
await setK('banner', 'Tournoi ce soir !'); await setK('free_minutes', 5);
await A.click('[data-gs=save]'); await A.waitForTimeout(600);
check('réglages enregistrés (seulement ce qui change)', JSON.stringify(mock.st.settings) === JSON.stringify({ free_minutes: 5, game: { hand: 7, life_bonus: 1, mulligan: false }, banner: 'Tournoi ce soir !' }), JSON.stringify(mock.st.settings));
check('bandeau affiché', (await A.textContent('.site-banner'))?.includes('Tournoi'));
// Partie locale : main de 7, pas de mulligan, Vies du Leader + 1
await A.evaluate(() => document.querySelector('[data-tab=play]').click());
await A.click('#tab-play details summary'); await A.check('#lb-local'); await A.click('#lb-host'); await A.waitForSelector('.code');
const code = (await A.textContent('.code')).trim();
const B = await mk('B');
await B.goto(SITE + '?test=1&local=1&join=' + code); await B.waitForSelector('#lb-join'); await B.click('#lb-join');
await A.waitForTimeout(800);
const winner = (await A.$('[data-do=first]')) ? A : B;
await winner.click(winner === A ? '[data-do=first]' : '[data-do=second]'); await A.waitForTimeout(400);
check('main de départ de 7', (await A.evaluate(() => __optcg.G().me.hand.length)) === 7);
check('pas de bouton Mulligan', !(await A.$('[data-do=mull]')));
await A.click('[data-do=keep]'); await B.click('[data-do=keep]'); await A.waitForTimeout(600);
const life = await A.evaluate(() => __optcg.G().me.life.length);
check('Vies du Leader + 1', life === 6, `${life}`);
// Maintenance : un autre joueur est bloqué, le propriétaire non
await A.evaluate(() => document.querySelector('[data-tab=gm]').click()); await A.waitForTimeout(200);
await A.check('[data-k="maintenance.on"]'); await A.fill('[data-k="maintenance.msg"]', 'On répare, à tout de suite !');
await A.click('[data-gs=save]'); await A.waitForTimeout(600);
const token = crypto.randomUUID(); mock.st.invites[token] = { token, username: 'nico', starter_id: null, boosters: 1, used_by: null };
const ctx2 = await b.newContext(); await ctx2.route(/supabase\.co/, mock.handle); await ctx2.route(/unpkg\.com/, (r) => r.abort());
const N = await ctx2.newPage(); N.on('pageerror', (e) => errs.push('N: ' + e.message));
await N.goto(SITE + '?test=1&invite=' + token); await N.waitForSelector('.auth form'); await N.waitForTimeout(400);
check('maintenance annoncée sur l\'écran de connexion', (await N.textContent('.auth')).includes('On répare'));
await N.fill('#au-pass', 'secret1'); await N.fill('#au-pass2', 'secret1'); await N.click('.auth .btn.primary');
await N.waitForSelector('.maint', { timeout: 8000 });
check('joueur bloqué par la maintenance', (await N.textContent('.maint')).includes('On répare'));
await A.reload(); await A.waitForSelector('.top .who', { timeout: 8000 });
check('le propriétaire passe la maintenance', !(await A.$('.maint')));
if (process.env.SHOT) { await A.evaluate(() => document.querySelector('[data-tab=gm]').click()); await A.waitForTimeout(300); await (await A.$('.gm-settings')).screenshot({ path: process.env.SHOT }); }
for (const r of results) console.log(r.join(' | '));
console.log('ERREURS', JSON.stringify(errs));
await b.close();
