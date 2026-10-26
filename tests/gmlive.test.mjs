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
await A.click('[data-tab=play]'); await A.click('#tab-play details summary'); await A.check('#lb-local'); await A.click('#lb-host'); await A.waitForSelector('.code');
const code = (await A.textContent('.code')).trim();
const B = await mk('B');
await B.goto(SITE + '?test=1&local=1&join=' + code); await B.waitForSelector('#lb-join'); await B.click('#lb-join');
await A.waitForTimeout(800);
// A commence toujours
const winner = (await A.$('[data-do=first]')) ? A : B;
await winner.click(winner === A ? '[data-do=first]' : '[data-do=second]'); await A.waitForTimeout(300);
await A.click('[data-do=keep]'); await B.click('[data-do=keep]'); await A.waitForTimeout(600);
const W = (ms = 500) => A.waitForTimeout(ms);
const g = (p, f, a) => p.evaluate(f, a);
const st = (p) => p.evaluate(() => { const G = __optcg.G(); const m = G.me; return { hand: m.hand.length, deck: m.deck.length, trash: m.trash.length, life: m.life.length, chars: m.chars.length, donA: m.donActive, donR: m.donRested, donD: m.donDeck, ld: m.leader.d || 0 }; });
const run = (p, effect, u) => p.evaluate(([e, u]) => __optcg.run(e, u), [effect, u]);
const E = (actions, extra = {}) => ({ when: 'activateMain', conds: [], costs: [], actions, ...extra });
const results = [];
const check = (label, ok, info = '') => { results.push([ok ? 'OK ' : 'ÉCHEC', label, info]); };
// Donne des DON!! en réserve à A et B pour les tests
await g(A, () => { const m = __optcg.G().me; m.donDeck = 5; m.donActive = 3; m.donRested = 2; __optcg.commit(); });
await g(B, () => { const m = __optcg.G().me; m.donActive = 3; __optcg.commit(); });
const placeB = (id, extra) => B.evaluate(([id, e]) => __optcg.place(id, 'chars', e), [id, extra || {}]);
// ---- Game Master en spectateur : rejoint la partie A/B (mode local) et corrige ----
const GMp = await mk('GM');
await GMp.setViewportSize({ width: 1400, height: 900 });
await GMp.goto(SITE + '?test=1'); await GMp.waitForSelector('.top .who'); await GMp.waitForTimeout(500);
await GMp.evaluate(() => document.querySelector('[data-tab=gm]').click()); await GMp.waitForTimeout(300);
await GMp.fill('.gl-code', code); await GMp.selectOption('.gl-mode', 'local'); await GMp.click('[data-gl=join]');
await GMp.waitForSelector('.gml-side[data-side=host] .gml-counters', { timeout: 8000 }); await GMp.waitForSelector('.gml-side[data-side=guest] .gml-counters', { timeout: 8000 });
check('le GM voit les deux joueurs', true);
const sA = () => st(A), sB = () => st(B);
let a0 = await sA();
await GMp.click('.gml-side[data-side=host] [data-op="life+"]'); await W(600);
let a1 = await sA(); check('GM : +1 Vie à l\'hôte', a1.life === a0.life + 1, `${a0.life}->${a1.life}`);
await GMp.click('.gml-side[data-side=host] [data-op=draw]'); await W(600);
let a2 = await sA(); check('GM : piocher 1', a2.hand === a1.hand + 1);
await GMp.click('.gml-side[data-side=host] [data-op="don+"]'); await W(600);
let a3 = await sA(); check('GM : +1 DON!!', a3.donA === a2.donA + 1);
const b0 = await sB();
await GMp.fill('.gml-side[data-side=guest] .gml-add input', 'P3 · C'); await GMp.selectOption('.gml-side[data-side=guest] .gml-add select', 'hand');
await GMp.click('.gml-side[data-side=guest] [data-op=add]'); await W(600);
const b1 = await sB(); check('GM : ajouter une carte en main à l\'invité', b1.hand === b0.hand + 1, `${b0.hand}->${b1.hand}`);
// déplacer la 1re carte de la main de l'hôte vers la défausse
await GMp.click('.gml-side[data-side=host] [data-zone=hand] .gml-card'); await W(300);
const a4 = await sA();
await GMp.click('[data-cop="mv:trash"]'); await W(600);
const a5 = await sA(); check('GM : déplacer une carte de la main vers la défausse', a5.hand === a4.hand - 1 && a5.trash === a4.trash + 1, `main ${a4.hand}->${a5.hand}`);
const logB = await g(B, () => __optcg.G().log.slice(-6).map((l) => l.text).join(' | '));
check('l\'adversaire voit les corrections signées Game Master', /Game Master/.test(logB), logB.slice(0, 160));
const turn0 = await g(A, () => __optcg.G().turn);
await GMp.click('.gml-side.turn [data-op=endTurn]'); await W(1200);
const turn1 = await g(A, () => __optcg.G().turn);
check('GM : forcer la fin du tour', turn1.player !== turn0.player || turn1.count !== turn0.count, `${JSON.stringify(turn0)} -> ${JSON.stringify(turn1)}`);
if (process.env.SHOT) await GMp.screenshot({ path: process.env.SHOT });
for (const r of results) console.log(r.join(' | '));
console.log('ERREURS', JSON.stringify(errs));
await b.close();
