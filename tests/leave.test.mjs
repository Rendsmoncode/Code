// Teste le déclencheur « Quand un de vos Personnages quitte le terrain » avec un Leader façon Buggy (Impel Down).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { makeMock } from './mock-supabase.mjs';

const SITE = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const mock = makeMock();
const C = (id, d) => { mock.st.cards[id] = { id, rarity: 'C', in_boosters: true, data: { name: id, colors: ['rouge'], traits: 'x', attribute: 'Frappe', counter: 1000, effects: [], ...d } }; };
C('Leader', { type: 'leader', life: 5, power: 5000, effects: [{
  when: 'onOwnLeave', once: true, wf: { type: 'Impel Down' }, conds: [{ k: 'donAttached', n: 1 }], costs: [],
  actions: [{ k: 'playFree', max: '', from: 'hand', f: { name: 'Prisoner of Impel Down' } }],
}] });
C('Gardien', { type: 'character', cost: 3, power: 4000, traits: 'Impel Down' });
C('Prisoner of Impel Down', { type: 'character', cost: 7, power: 8000, traits: 'Impel Down' });
C('Pirate', { type: 'character', cost: 1, power: 1000, traits: 'Équipage' });
const deck = { Gardien: 4, 'Prisoner of Impel Down': 4, Pirate: 4 };
for (let i = 0; i < 10; i++) { C(`P${i}`, { type: 'character', cost: 1, power: 1000 }); deck[`P${i}`] = 4; }
deck.P9 = 2;
mock.st.starters.s1 = { id: 's1', name: 'Test', leader: 'Leader', cards: deck };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route(/supabase\.co/, mock.handle);
await ctx.route(/unpkg\.com/, (r) => r.abort());
await ctx.addInitScript(() => setInterval(() => {
  const o = document.querySelector('.overlay .dialog'); if (!o) return;
  const ok = o.querySelector('[data-ok]');
  const picks = [...o.querySelectorAll('.grid-card.pick:not(.off)')];
  if (picks.length && ok) { if (!o.querySelector('.grid-card.pick.on')) { picks[0].click(); return; } if (!ok.disabled) ok.click(); return; }
  if (ok) { ok.click(); return; }
  o.querySelector('.btn.primary')?.click();
}, 120));
const errs = [];
const mk = async (n) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${n}: ${e.message}`)); p.on('dialog', (d) => d.accept()); return p; };
const A = await mk('A');
await A.goto(`${SITE}?test=1`);
await A.click('[data-mode=up]'); await A.fill('#au-user', 'ayoub'); await A.fill('#au-pass', 'secret1'); await A.fill('#au-pass2', 'secret1');
await A.click('.auth .btn.primary'); await A.waitForSelector('.starter'); await A.click('.starter'); await A.waitForTimeout(800);
await A.click('[data-tab=play]'); await A.click('#tab-play details summary'); await A.check('#lb-local'); await A.click('#lb-host'); await A.waitForSelector('.code');
const code = (await A.textContent('.code')).trim();
const B = await mk('B');
await B.goto(`${SITE}?test=1&local=1&join=${code}`); await B.waitForSelector('#lb-join'); await B.click('#lb-join');
await A.waitForTimeout(800);
const w = (await A.$('[data-do=first]')) ? A : B;
await w.click(w === A ? '[data-do=first]' : '[data-do=second]'); await A.waitForTimeout(300);
await A.click('[data-do=keep]'); await B.click('[data-do=keep]'); await A.waitForTimeout(800);
const g = (p, f, a) => p.evaluate(f, a);
const results = [];
const check = (label, ok, info = '') => results.push([ok ? 'OK ' : 'ÉCHEC', label, info]);
const W = (ms = 1200) => A.waitForTimeout(ms);
// A : Leader avec 1 DON!!, un Gardien (Impel Down) et un Pirate en jeu, deux « Prisoner » en main.
const setup = (don) => g(A, (don) => {
  const G = __optcg.G(); const m = G.me;
  m.leader.d = don; m.chars = []; m.leader.used = {};
  m.hand = m.hand.filter((x) => x.c !== 'Prisoner of Impel Down');
  for (let k = 0; k < 2; k++) m.hand.push({ u: `pr${k}${Math.random()}`, c: 'Prisoner of Impel Down', r: false, d: 0 });
  __optcg.place('Gardien'); __optcg.place('Gardien'); __optcg.place('Pirate');
}, don);
const chars = () => g(A, () => __optcg.G().me.chars.map((x) => x.c));
const koOpp = (who) => g(B, (who) => __optcg.run({ when: 'activateMain', conds: [], costs: [], actions: [{ k: 'ko', t: { side: 'opp', who: 'chars', n: 1, f: { type: who } } }] }), who);
await setup(1); await W(600);
await koOpp('Impel Down'); await W();
let c = await chars();
check('un Gardien (Impel Down) quitte le terrain → « Prisoner » joué depuis la main', c.includes('Prisoner of Impel Down') && c.filter((x) => x === 'Gardien').length === 1, c.join(', '));
await g(A, () => { const m = __optcg.G().me; m.chars = m.chars.filter((x) => x.c !== 'Prisoner of Impel Down'); __optcg.commit(); });
await koOpp('Impel Down'); await W();
c = await chars();
check('une fois par tour : pas de deuxième « Prisoner »', !c.includes('Prisoner of Impel Down'), c.join(', '));
await setup(1); await W(600);
await koOpp('Équipage'); await W();
c = await chars();
check('un Pirate (autre type) quitte le terrain → rien', !c.includes('Prisoner of Impel Down'), c.join(', '));
await setup(0); await W(600);
await koOpp('Impel Down'); await W();
c = await chars();
check('sans DON!! attaché au Leader → rien', !c.includes('Prisoner of Impel Down'), c.join(', '));
await setup(1); await W(600);
await g(A, () => { const m = __optcg.G().me; const x = m.chars.find((i) => i.c === 'Gardien'); __optcg.run({ when: 'activateMain', conds: [], costs: [], actions: [{ k: 'bounce', t: { side: 'mine', who: 'chars', n: 1, f: { type: 'Impel Down' } } }] }, m.leader.u); });
await W();
c = await chars();
check('renvoi en main (pas seulement KO) → « Prisoner » joué', c.includes('Prisoner of Impel Down'), c.join(', '));
console.log(results.map((r) => r.join(' | ')).join('\n'));
console.log('total', results.length, 'échecs', results.filter((r) => r[0] !== 'OK ').length);
console.log('ERREURS', errs);
await b.close();
