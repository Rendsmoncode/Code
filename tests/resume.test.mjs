// Teste la reprise d'une partie après le rechargement d'un onglet (mode local), côté invité puis côté hôte.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { makeMock } from './mock-supabase.mjs';

const SITE = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const mock = makeMock();
const C = (id, d) => { mock.st.cards[id] = { id, rarity: 'C', in_boosters: true, data: { name: id, colors: ['rouge'], traits: 'x', attribute: 'Frappe', counter: 1000, effects: [], ...d } }; };
C('Leader', { type: 'leader', life: 5, power: 5000 });
const deck = {};
for (let i = 0; i < 13; i++) { C(`P${i}`, { type: 'character', cost: 1, power: 1000 }); deck[`P${i}`] = 4; }
deck.P12 = 2;
mock.st.starters.s1 = { id: 's1', name: 'Test', leader: 'Leader', cards: deck };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route(/supabase\.co/, mock.handle);
await ctx.route(/unpkg\.com/, (r) => r.abort());
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
const snap = (p) => g(p, () => { const G = __optcg.G(); return JSON.stringify({ hand: G.me.hand.map((x) => x.u), life: G.me.life.length, deck: G.me.deck.length, turn: G.turn, role: G.role }); });
const results = [];
const check = (label, ok, info = '') => results.push([ok ? 'OK ' : 'ÉCHEC', label, info]);

async function reloadAndResume(R, O, who) {
  const active = (await g(A, () => __optcg.G().turn.player === __optcg.G().role)) ? A : B;
  await g(active, () => __optcg.endTurn()); await A.waitForTimeout(800);
  const before = await snap(R);
  await R.reload();
  await R.waitForSelector('.who .me');
  await R.click('[data-tab=play]');
  const offered = await R.waitForSelector('#lb-resume', { timeout: 5000 }).then(() => true).catch(() => false);
  check(`${who} : reprise proposée`, offered);
  if (!offered) return;
  await R.click('#lb-resume'); await A.waitForTimeout(1500);
  const after = await snap(R);
  check(`${who} : état retrouvé à l'identique (main, Vie, deck, tour)`, before === after);
  check(`${who} : l'autre joueur le voit de retour`, await g(O, () => !__optcg.G().disconnected && __optcg.G().log.some((l) => l.text.includes('de retour'))));
  check(`${who} : plateau adverse visible`, await g(R, () => Boolean(__optcg.G().opp?.leader)));
  const now = (await g(A, () => __optcg.G().turn.player === __optcg.G().role)) ? A : B;
  const other = now === A ? B : A;
  const c0 = await g(other, () => __optcg.G().turn.count);
  await g(now, () => __optcg.endTurn()); await A.waitForTimeout(1200);
  const mine = await g(other, () => __optcg.G().turn.player === __optcg.G().role);
  check(`${who} : la partie continue`, mine && (await g(other, () => __optcg.G().turn.count)) === c0 + 1);
}
await reloadAndResume(B, A, 'invité');
await reloadAndResume(A, B, 'hôte');
console.log(results.map((r) => r.join(' | ')).join('\n'));
console.log('total', results.length, 'échecs', results.filter((r) => r[0] !== 'OK ').length);
console.log('ERREURS', errs);
await b.close();
