// Briques ajoutées après la vérification des cartes officielles (conditions, coûts, actions, remplacement…).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
const SITE = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
import { makeMock } from './mock-supabase.mjs';
const mock = makeMock();
const C = (id, d) => { mock.st.cards[id] = { id, rarity: 'C', in_boosters: true, data: { name: id, colors: ['rouge'], traits: 'Équipage', attribute: 'Frappe', counter: 1000, effects: [], ...d } }; };
C('Leader', { type: 'leader', life: 5, power: 5000, name: 'Koala' });
for (let i = 0; i < 13; i++) C('P' + i, { type: 'character', cost: 1 + (i % 4), power: 1000 + 1000 * (i % 5) });
const draw1 = [{ k: 'draw', n: 1 }];
C('Gros', { type: 'character', cost: 8, power: 9000 });
C('Ev', { type: 'event', cost: 1, effects: [{ when: 'main', conds: [], costs: [], actions: draw1 }, { when: 'trigger', conds: [], costs: [], actions: [{ k: 'useMain' }] }] });
C('Garde', { type: 'character', cost: 2, power: 3000, effects: [{ when: 'replace', rp: { ev: 'koOpp', who: 'self' }, conds: [], costs: [{ k: 'discard', n: 1, f: {} }], actions: [] }] });
C('Veille', { type: 'character', cost: 2, power: 3000, effects: [{ when: 'onOwnLeaveOpp', wf: {}, conds: [], costs: [], actions: draw1 }] });
C('Vif', { type: 'character', cost: 2, power: 3000, keywords: ['rushChar'] });
const deck = {}; for (let i = 0; i < 11; i++) deck['P' + i] = 4; deck.Gros = 1; deck.Ev = 1; deck.Garde = 1; deck.Veille = 1; deck.Vif = 1; deck.P11 = 1;
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
const placeA = (id, extra) => A.evaluate(([id, e]) => __optcg.place(id, 'chars', e), [id, extra || {}]);
let s0, s1;
const ok1 = async (label, extra, expect) => {
  s0 = await st(A); await run(A, E(draw1, extra)); await W(600); s1 = await st(A);
  const drew = s1.hand === s0.hand + 1;
  check(label, drew === expect, `pioche : ${drew}`);
};
// Conditions
await ok1('Leader est [Koala]', { conds: [{ k: 'leaderName', v: 'Koala' }] }, true);
await ok1('Leader est [Luffy] (non)', { conds: [{ k: 'leaderName', v: 'Luffy' }] }, false);
await ok1('Leader multicolore (non)', { conds: [{ k: 'leaderMulti' }] }, false);
await ok1('DON!! sur le terrain ≤ 10', { conds: [{ k: 'donFieldLE', n: 10 }] }, true);
await ok1('DON!! ≤ 1 (non)', { conds: [{ k: 'donFieldLE', n: 1 }] }, false);
await ok1('DON!! comparés : supérieur à l\'adversaire', { conds: [{ k: 'donCmp', cmp: 'gt' }] }, true);
await ok1('adversaire a 1 carte ou plus en main', { conds: [{ k: 'oppCount', what: 'hand', cmp: 'ge', n: 1 }] }, true);
await ok1('adversaire a 9 Personnages (non)', { conds: [{ k: 'oppCount', what: 'chars', cmp: 'ge', n: 9 }] }, false);
await ok1('« S\'il y a un Personnage de coût 8 » (non)', { conds: [{ k: 'anyChar', n: 1, side: 'any', f: { minCost: 8 } }] }, false);
await placeB('Gros'); await W(500);
await ok1('« S\'il y a un Personnage de coût 8 » (chez l\'adversaire)', { conds: [{ k: 'anyChar', n: 1, side: 'any', f: { minCost: 8 } }] }, true);
await ok1('type exact « Équip » (non)', { conds: [{ k: 'charsGE', n: 1, f: { type: 'Équip' } }] }, false);
await placeA('P1'); await W(300);
await ok1('type incluant « Équip »', { conds: [{ k: 'charsGE', n: 1, f: { type: 'Équip', typeIncl: 'yes' } }] }, true);
// Coûts
await ok1('coût : défausser une carte filtrée (aucune ne convient)', { costs: [{ k: 'discard', n: 1, f: { type: 'Autre' } }] }, false);
s0 = await st(A); await run(A, E(draw1, { costs: [{ k: 'discard', n: 1, f: { cardType: 'character' } }] })); await W(600); s1 = await st(A);
check('coût : défausser un Personnage', s1.trash === s0.trash + 1 && s1.hand === s0.hand, `${s0.trash}->${s1.trash}`);
const p1 = await g(A, () => __optcg.G().me.chars.find((x) => x.c === 'P1').u);
await run(A, E(draw1, { costs: [{ k: 'trashSelf' }] }), p1); await W(600);
check('coût : placer cette carte dans la défausse', await g(A, (u) => __optcg.G().me.trash.some((x) => x.u === u), p1));
await run(A, E(draw1, { costs: [{ k: 'lifeFlip' }] })); await W(800);
const upA = await g(A, () => __optcg.G().me.life.at(-1).fu === true);
const upB = await g(B, () => (__optcg.G().opp.lifeUp || []).filter(Boolean).length);
check('coût : retourner une Vie face visible (vue par l\'adversaire)', upA && upB === 1, `A : ${upA}, B voit ${upB}`);
// Actions
const bottom = await g(A, () => __optcg.G().me.life[0].u);
await run(A, E([{ k: 'lifeToHand', n: 1, pos: 'bottom' }])); await W(600);
check('prendre la Vie du dessous', await g(A, (u) => __optcg.G().me.hand.some((x) => x.u === u), bottom));
await g(A, () => { const m = __optcg.G().me; const a = m.hand.findIndex((x) => x.c === 'P1'); const b2 = m.hand.findIndex((x) => x.c === 'P2');
  if (a < 0) m.hand.push(m.deck.splice(m.deck.findIndex((x) => x.c === 'P1'), 1)[0]);
  if (b2 < 0) m.hand.push(m.deck.splice(m.deck.findIndex((x) => x.c === 'P2'), 1)[0]);
  m.trash = []; for (const c of ['P1', 'P2']) m.trash.push(m.hand.splice(m.hand.findIndex((x) => x.c === c), 1)[0]); __optcg.commit(); });
await run(A, E([{ k: 'trashToHand', n: 1, f: { notName: 'P1' } }])); await W(700);
const tr = await g(A, () => __optcg.G().me.trash.map((x) => x.c));
check('défausse → main, « autre que [P1] »', tr.length === 1 && tr[0] === 'P1', tr.join(','));
await run(A, E([{ k: 'playFree', max: '', f: {}, from: 'trash', state: 'rested' }])); await W(700);
const played = await g(A, () => __optcg.G().me.chars.find((x) => x.c === 'P1'));
check('jouer une carte épuisée depuis la défausse', played && played.r === true, JSON.stringify(played && { r: played.r }));
const ev = await g(A, () => __optcg.place('Ev', 'hand'));
s0 = await st(A); await run(A, { when: 'trigger', conds: [], costs: [], actions: [{ k: 'useMain' }] }, ev); await W(800); s1 = await st(A);
check('[Déclenchement] activez l\'effet [Principale]', s1.hand === s0.hand + 1, `${s0.hand}->${s1.hand}`);
// Placer un Personnage adverse dans sa Vie, face visible
const bl0 = await g(B, () => [__optcg.G().me.life.length, __optcg.G().me.chars.length]);
await run(A, E([{ k: 'toLife', t: { side: 'opp', who: 'chars', n: 1, f: { minCost: 8 } }, pos: 'top', face: 'up' }])); await W(1200);
const bl1 = await g(B, () => [__optcg.G().me.life.length, __optcg.G().me.chars.length, __optcg.G().me.life.at(-1).fu]);
check('Personnage adverse placé dans sa Vie face visible', bl1[0] === bl0[0] + 1 && bl1[1] === bl0[1] - 1 && bl1[2] === true, JSON.stringify([bl0, bl1]));
// Remplacement : Garde défausse une carte au lieu d'être mis KO par un effet adverse
await g(B, () => { const m = __optcg.G().me; m.chars = []; __optcg.commit(); });
const garde = await placeB('Garde'); await W(400);
const bh0 = await g(B, () => __optcg.G().me.hand.length);
await run(A, E([{ k: 'ko', t: { side: 'opp', who: 'chars', n: 1 } }])); await W(1500);
const gs = await g(B, (u) => [__optcg.G().me.chars.some((x) => x.u === u), __optcg.G().me.hand.length], garde);
check('effet de remplacement (défausse au lieu du KO)', gs[0] && gs[1] === bh0 - 1, JSON.stringify([bh0, gs]));
// Déclencheur : un de vos Personnages quitte le terrain à cause d'un effet adverse
await g(B, () => { const m = __optcg.G().me; m.chars = []; __optcg.commit(); });
await placeB('Veille'); await placeB('P3'); await W(400);
const bh1 = await g(B, () => __optcg.G().me.hand.length);
await run(A, E([{ k: 'bounce', t: { side: 'opp', who: 'chars', n: 1, f: { name: 'P3' } } }])); await W(1500);
const bh2 = await g(B, () => __optcg.G().me.hand.length);
check('[quitte le terrain à cause d\'un effet adverse] pioche', bh2 === bh1 + 2, `${bh1}->${bh2} (+1 renvoyé, +1 pioché)`);
// [Initiative : Personnage]
const vif = await placeA('Vif', { t: await g(A, () => __optcg.G().turn.count) }); await W(300);
await g(A, () => { __optcg.G().turn.count = Math.max(3, __optcg.G().turn.count); });
await g(A, (u) => { const i = __optcg.G().me.chars.find((x) => x.u === u); i.t = __optcg.G().turn.count; __optcg.attack(u); }, vif); await W(300);
const sel = await g(A, () => __optcg.G().select);
const leaderTarget = await A.$('.side.opp .leader-zone .slot.target');
check('[Initiative : Personnage] attaque possible, pas le Leader', sel?.onlyChars === true && !leaderTarget, JSON.stringify(sel));
await g(A, () => { __optcg.G().select = null; __optcg.commit(); });
// Durée « jusqu'à la fin du prochain tour adverse »
const tgt = await placeA('P0'); await W(300);
const pw0 = await g(A, (u) => __optcg.power(u), tgt);
await run(A, E([{ k: 'power', t: { side: 'mine', who: 'chars', n: 1, f: { name: 'P0' } }, amount: 2000, dur: 'next' }])); await W(500);
const pw1 = await g(A, (u) => __optcg.power(u), tgt);
await g(A, () => __optcg.endTurn()); await W(1500);
const pw2 = await g(A, (u) => __optcg.power(u), tgt);
await g(B, () => __optcg.endTurn()); await W(2000);
const pw3 = await g(A, (u) => __optcg.power(u), tgt);
check('+2000 jusqu\'à la fin du prochain tour adverse', pw1 === pw0 + 2000 && pw2 === pw1 && pw3 === pw0, JSON.stringify([pw0, pw1, pw2, pw3]));

for (const r of results) console.log(r.join(' | '));
console.log('total', results.length, 'échecs', results.filter((r) => r[0] !== 'OK ').length);
console.log('ERREURS', JSON.stringify(errs));
await b.close();
