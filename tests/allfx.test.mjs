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
const placeA = (id, extra) => A.evaluate(([id, e]) => __optcg.place(id, 'chars', e), [id, extra || {}]);
let s0, s1, b0, b1;

async function act(label, actions, assert, opts = {}) {
  s0 = await st(A); b0 = await st(B);
  const r = await run(A, E(actions, opts.extra), opts.src);
  await W(opts.wait || 700);
  s1 = await st(A); b1 = await st(B);
  let ok = false; let info = '';
  try { [ok, info] = await assert(r); } catch (e) { info = e.message; }
  check(label, ok, info);
}
const bChar = async (i = 0) => g(B, (i) => __optcg.G().me.chars[i], i);

await act('draw', [{ k: 'draw', n: 2 }], async () => [s1.hand === s0.hand + 2, `${s0.hand}->${s1.hand}`]);
await act('discard', [{ k: 'discard', n: 1 }], async () => [s1.hand === s0.hand - 1 && s1.trash === s0.trash + 1, `main ${s0.hand}->${s1.hand}`]);
await act('oppDiscard', [{ k: 'oppDiscard', n: 1 }], async () => [b1.hand === b0.hand - 1, `B main ${b0.hand}->${b1.hand}`], { wait: 1200 });
await act('look', [{ k: 'look', n: 3, take: 1, rest: 'bottom', f: {} }], async () => [s1.hand === s0.hand + 1 && s1.deck === s0.deck - 1, `main +${s1.hand - s0.hand}`]);
await act('search', [{ k: 'search', f: {} }], async () => [s1.hand === s0.hand + 1, '']);
await act('mill', [{ k: 'mill', n: 2 }], async () => [s1.trash === s0.trash + 2 && s1.deck === s0.deck - 2, '']);
await act('playFree', [{ k: 'playFree', max: 5, from: 'hand', f: {} }], async () => [s1.chars === s0.chars + 1, `persos ${s0.chars}->${s1.chars}`]);
let u1 = await placeB('P1'); await W(400);
await act('ko (adverse)', [{ k: 'ko', t: { side: 'opp', who: 'chars', n: 1 } }], async () => [b1.chars === b0.chars - 1 && b1.trash === b0.trash + 1, `B persos ${b0.chars}->${b1.chars}`], { wait: 1200 });
u1 = await placeB('P1'); await W(400);
await act('bounce (adverse)', [{ k: 'bounce', t: { side: 'opp', who: 'chars', n: 1 } }], async () => [b1.chars === b0.chars - 1 && b1.hand === b0.hand + 1, ''], { wait: 1200 });
u1 = await placeB('P1'); await W(400);
await act('toBottom (adverse)', [{ k: 'toBottom', t: { side: 'opp', who: 'chars', n: 1 } }], async () => [b1.chars === b0.chars - 1 && b1.deck === b0.deck + 1, ''], { wait: 1200 });
u1 = await placeB('P1'); await W(400);
await act('rest (adverse)', [{ k: 'rest', t: { side: 'opp', who: 'chars', n: 1 } }], async () => [(await bChar()).r === true, ''], { wait: 1000 });
await act('freeze (adverse)', [{ k: 'freeze', t: { side: 'opp', who: 'chars', n: 1 } }], async () => [(await bChar()).frozen === true, ''], { wait: 1000 });
await act('cannotAttack (adverse)', [{ k: 'cannotAttack', t: { side: 'opp', who: 'chars', n: 1 } }], async () => [(await bChar()).noAtk >= 1, ''], { wait: 1000 });
await act('negate (adverse)', [{ k: 'negate', t: { side: 'opp', who: 'chars', n: 1 } }], async () => [(await bChar()).neg === true, ''], { wait: 1000 });
const bc0 = await g(B, () => __optcg.cost(__optcg.G().me.chars[0].u));
await act('cost −2 (adverse)', [{ k: 'cost', t: { side: 'opp', who: 'chars', n: 1 }, amount: -2, dur: 'turn' }], async () => { const c = await g(B, () => __optcg.cost(__optcg.G().me.chars[0].u)); return [c === bc0 - 2, `${bc0}->${c}`]; }, { wait: 1000 });
const bp0 = await g(B, () => __optcg.power(__optcg.G().me.chars[0].u));
await act('power −1000 (adverse)', [{ k: 'power', t: { side: 'opp', who: 'chars', n: 1 }, amount: -1000, dur: 'turn' }], async () => { const p = await g(B, () => __optcg.power(__optcg.G().me.chars[0].u)); return [p === bp0 - 1000, `${bp0}->${p}`]; }, { wait: 1000 });
const mine = await placeA('P2', { r: true }); await W(300);
await act('untap (moi)', [{ k: 'untap', t: { side: 'mine', who: 'self' } }], async () => [!(await g(A, (u) => __optcg.G().me.chars.find((x) => x.u === u).r, mine)), ''], { src: mine });
const p0 = await g(A, (u) => __optcg.power(u), mine);
await act('power +2000 (moi)', [{ k: 'power', t: { side: 'mine', who: 'self' }, amount: 2000, dur: 'turn' }], async () => { const p = await g(A, (u) => __optcg.power(u), mine); return [p === p0 + 2000, `${p0}->${p}`]; }, { src: mine });
await act('grantKw Bloqueur (moi)', [{ k: 'grantKw', t: { side: 'mine', who: 'self' }, kw: 'blocker', dur: 'turn' }], async () => [await g(A, (u) => __optcg.kw(u, 'blocker'), mine), ''], { src: mine });
await act('protect (moi)', [{ k: 'protect', t: { side: 'mine', who: 'self' }, by: 'battle', dur: 'turn' }], async () => [await g(A, (u) => __optcg.prot(u, 'battle'), mine), ''], { src: mine });
await act('donAdd', [{ k: 'donAdd', n: 1, state: 'active' }], async () => [s1.donA === s0.donA + 1 && s1.donD === s0.donD - 1, '']);
await act('donAttach', [{ k: 'donAttach', n: 1, t: { side: 'mine', who: 'leader', n: 1 } }], async () => [s1.ld === s0.ld + 1 && s1.donR === s0.donR - 1, `leader DON ${s0.ld}->${s1.ld}`]);
await g(A, () => { const m = __optcg.G().me; m.donRested += 1; __optcg.commit(); });
await act('donUntap', [{ k: 'donUntap', n: 1 }], async () => [s1.donA === s0.donA + 1, '']);
await act('donOppReturn', [{ k: 'donOppReturn', n: 1 }], async () => [b1.donD === b0.donD + 1, `B deck DON ${b0.donD}->${b1.donD}`], { wait: 1000 });
await act('restOppDon', [{ k: 'restOppDon', n: 1 }], async () => [b1.donA === b0.donA - 1 && b1.donR === b0.donR + 1, ''], { wait: 1000 });
await act('lifeFromDeck', [{ k: 'lifeFromDeck', n: 1 }], async () => [s1.life === s0.life + 1, '']);
await act('lifeFromHand', [{ k: 'lifeFromHand', n: 1 }], async () => [s1.life === s0.life + 1 && s1.hand === s0.hand - 1, '']);
await act('lifeToHand', [{ k: 'lifeToHand', n: 1 }], async () => [s1.life === s0.life - 1 && s1.hand === s0.hand + 1, '']);
await act('oppLifeRemove', [{ k: 'oppLifeRemove', n: 1, to: 'trash' }], async () => [b1.life === b0.life - 1 && b1.trash === b0.trash + 1, ''], { wait: 1000 });
await act('lifeLook (réordonner)', [{ k: 'lifeLook' }], async () => [s1.life === s0.life && (await g(A, () => __optcg.G().log.some((l) => l.text.includes('réordonne')))), '']);
await act('playSelf', [{ k: 'playSelf' }], async (r) => [r?.played === true, JSON.stringify(r)]);
await g(A, () => { const G = __optcg.G(); G.battle = { role: 'atk', step: 'attack' }; });
await act('noBlockers', [{ k: 'noBlockers' }], async () => [await g(A, () => __optcg.G().battle.noBlock === true), '']);
await g(A, () => { const G = __optcg.G(); G.battle = { role: 'def', step: 'defense', target: G.me.leader.u, targetIsLeader: true, counter: 0 }; });
await act('redirect', [{ k: 'redirect' }], async () => [await g(A, () => { const G = __optcg.G(); return G.battle.target !== G.me.leader.u; }), '']);
await g(A, () => { __optcg.G().battle = null; __optcg.commit(); });
// Coûts
const cost = (label, costs, assert, src) => act(`coût ${label}`, [{ k: 'draw', n: 1 }], assert, { extra: { costs }, src });
await g(A, () => { const m = __optcg.G().me; m.donActive = 3; __optcg.commit(); });
await cost('restDon', [{ k: 'restDon', n: 2 }], async () => [s1.donA === s0.donA - 2 && s1.hand === s0.hand + 1, '']);
await cost('donReturn', [{ k: 'donReturn', n: 1 }], async () => [s1.donD === s0.donD + 1, '']);
await cost('discard', [{ k: 'discard', n: 1 }], async () => [s1.trash === s0.trash + 1 && s1.hand === s0.hand, '']);
await cost('restLeader', [{ k: 'restLeader' }], async () => [await g(A, () => __optcg.G().me.leader.r), ''], mine);
await g(A, () => { __optcg.G().me.leader.r = false; __optcg.commit(); });
await cost('restSelf', [{ k: 'restSelf' }], async () => [await g(A, (u) => __optcg.G().me.chars.find((x) => x.u === u).r, mine), ''], mine);
await g(A, (u) => { __optcg.G().me.chars.find((x) => x.u === u).r = false; }, mine);
await placeA('P3'); await W(300);
await cost('koOwn', [{ k: 'koOwn' }], async () => [s1.chars === s0.chars - 1, '']);
await cost('trashToDeck', [{ k: 'trashToDeck', n: 1 }], async () => [s1.trash === s0.trash - 1, '']);
await cost('lifeToHand', [{ k: 'lifeToHand' }], async () => [s1.life === s0.life - 1, '']);
await cost('revealHand', [{ k: 'revealHand', f: {} }], async () => [s1.hand === s0.hand + 1 && (await g(A, () => __optcg.G().log.some((l) => l.text.startsWith('révèle')))), '']);
// Conditions
await act('condition non remplie (lifeLE 0)', [{ k: 'draw', n: 1 }], async () => [s1.hand === s0.hand, ''], { extra: { conds: [{ k: 'lifeLE', n: 0 }] } });
await act('condition remplie (handLE 99)', [{ k: 'draw', n: 1 }], async () => [s1.hand === s0.hand + 1, ''], { extra: { conds: [{ k: 'handLE', n: 99 }] } });
await act('condition « aucune carte de type Marine » remplie', [{ k: 'draw', n: 1 }], async () => [s1.hand === s0.hand + 1, ''], { extra: { conds: [{ k: 'noTypeField', type: 'Marine', self: 'skip' }] } });
await act('condition « aucune carte de type Équipage » non remplie', [{ k: 'draw', n: 1 }], async () => [s1.hand === s0.hand, ''], { extra: { conds: [{ k: 'noTypeField', type: 'Équipage', self: 'skip' }] } });
// Filtre puissance de base : B a un perso faible (1000) et un fort (6000 de base)
await g(B, () => { const m = __optcg.G().me; m.chars = []; __optcg.commit(); }); await W(300);
await placeB('P0'); await placeB('Fort'); await W(500);
await act('ko filtre puissance de base ≤ 2000', [{ k: 'ko', t: { side: 'opp', who: 'chars', n: 1, f: { maxBasePower: 2000 } } }], async () => {
  const left = await g(B, () => __optcg.G().me.chars.map((x) => x.c)); return [left.length === 1 && left[0] === 'Fort', left.join(',')]; }, { wait: 1200 });
// Aura : effet permanent de A (−1000 à tous les persos adverses pendant le tour de A)
const fp0 = await g(B, () => __optcg.power(__optcg.G().me.chars[0].u));
await placeA('Aura'); await W(1200);
const fp1 = await g(B, () => __optcg.power(__optcg.G().me.chars[0].u));
const seenByA = await g(A, () => __optcg.G().opp.chars[0].p);
check('aura −1000 sur les persos adverses', fp1 === fp0 - 1000 && seenByA === fp1, `${fp0}->${fp1}, vu par A : ${seenByA}`);
// « [KO] Jouez cette carte depuis votre défausse »
await g(A, () => { const m = __optcg.G().me; m.chars = []; __optcg.commit(); }); await W(300);
await placeA('Phoenix'); await W(300);
await run(B, E([{ k: 'ko', t: { side: 'opp', who: 'chars', n: 1 } }])); await W(1500);
const phx = await g(A, () => [__optcg.G().me.chars.map((x) => x.c), __optcg.G().me.trash.filter((x) => x.c === 'Phoenix').length]);
check('[KO] jouez cette carte depuis la défausse', phx[0].includes('Phoenix') && phx[1] === 0, JSON.stringify(phx));
// « Donnez [Initiative] à un de vos Personnages de coût 6 ou moins »
await g(A, () => { const m = __optcg.G().me; m.chars = []; __optcg.commit(); }); await W(300);
const gros = await placeA('Gros', { t: 1 }); const moyen = await placeA('Moyen', { t: 1 }); await W(300);
await run(A, E([{ k: 'grantKw', t: { side: 'mine', who: 'chars', n: 1, f: { maxCost: 6 } }, kw: 'rush', dur: 'turn' }])); await W(800);
const kwM = await g(A, (u) => __optcg.kw(u, 'rush'), moyen);
const kwG = await g(A, (u) => __optcg.kw(u, 'rush'), gros);
check('Initiative donnée au coût 5, pas au coût 8', kwM === true && kwG === false, `coût 5 : ${kwM}, coût 8 : ${kwG}`);
// Sabo : permanent « 4 Vies ou plus : −1000 » et « [DON!! x1] si un Perso de coût 8+ : Leader et Persos +1000 »
await g(A, () => { const m = __optcg.G().me; m.chars = []; while (m.life.length < 4) m.life.push(m.deck.pop()); __optcg.commit(); }); await W(300);
const sabo = await placeA('SaboFx', { d: 1 }); await W(300);
const pw = () => g(A, (u) => [__optcg.power(u), __optcg.power(__optcg.G().me.leader.u)], sabo);
const pw0 = await pw();
await placeA('Gros'); await W(300);
const pw1 = await pw();
await g(A, () => { const m = __optcg.G().me; while (m.life.length > 3) m.deck.push(m.life.pop()); __optcg.commit(); }); await W(300);
const pw2 = await pw();
check('Sabo : −1000 avec 4 Vies, +1000 avec un coût 8', pw1[0] === pw0[0] + 1000 && pw1[1] === pw0[1] + 1000 && pw2[0] === pw1[0] + 1000 && pw2[1] === pw1[1],
  JSON.stringify([pw0, pw1, pw2]));
await g(A, () => { const m = __optcg.G().me; m.chars = []; __optcg.commit(); }); await W(300);

// Déclencheurs automatiques
await g(A, () => { const m = __optcg.G().me; m.chars = []; __optcg.commit(); }); await W(300);
await placeA('TKO'); await W(300);
s0 = await st(A);
await run(B, E([{ k: 'ko', t: { side: 'opp', who: 'chars', n: 1 } }])); await W(1500);
s1 = await st(A);
check('déclencheur [KO] (pioche 1)', s1.hand === s0.hand + 1, `${s0.hand}->${s1.hand}`);
await placeA('TPC'); await W(300);
await g(A, () => { const m = __optcg.G().me; const i = m.deck.findIndex((x) => x.c.startsWith('P')); m.hand.push(m.deck.splice(i, 1)[0]); __optcg.commit(); });
s0 = await st(A);
await run(A, E([{ k: 'playFree', max: 9, from: 'hand', f: {} }])); await W(1000);
s1 = await st(A);
check('déclencheur « quand vous jouez un Personnage »', s1.hand === s0.hand, `main ${s0.hand}->${s1.hand} (−1 joué, +1 pioché)`);
await placeA('TEnd'); await B.evaluate(() => __optcg.place('TStart')); await W(500);
s0 = await st(A); b0 = await st(B);
// Fin du tour de A : l aura (votre tour) ne s applique plus
await g(A, () => __optcg.endTurn()); await W(1500);
const fp2 = await g(B, () => __optcg.power(__optcg.G().me.chars.find((x) => x.c === 'Fort').u));
s1 = await st(A); b1 = await st(B);
check('déclencheur fin de votre tour (pioche 1)', s1.hand === s0.hand + 1, `${s0.hand}->${s1.hand}`);
check('déclencheur début de votre tour (B pioche 1 + 1)', b1.hand === b0.hand + 2, `${b0.hand}->${b1.hand}`);
check('aura terminée au tour adverse', fp2 === fp0, `${fp2}`);
console.log(results.map((r) => r.join(' | ')).join('\n'));
console.log('total', results.length, 'échecs', results.filter((r) => r[0] !== 'OK ').length);
console.log('ERREURS', errs); await b.close();
