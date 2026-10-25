// Teste le déroulement d'une partie : Bloqueur, déclencheurs de combat, Déclenchement depuis la Vie, victoire, deck vide.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { makeMock } from './mock-supabase.mjs';

const SITE = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const mock = makeMock();
const C = (id, d) => { mock.st.cards[id] = { id, rarity: 'C', in_boosters: true, data: { name: id, colors: ['rouge'], traits: 'Équipage', attribute: 'Frappe', counter: 1000, effects: [], ...d } }; };
const draw = (n) => [{ k: 'draw', n }];
C('Leader', { type: 'leader', life: 5, power: 5000 });
C('Mur', { type: 'character', cost: 1, power: 2000, keywords: ['blocker'], effects: [{ when: 'onBlock', conds: [], costs: [], actions: draw(1) }] });
C('Guetteur', { type: 'character', cost: 1, power: 1000, effects: [{ when: 'onOppAttack', conds: [], costs: [], actions: draw(1) }] });
C('Blessé', { type: 'character', cost: 1, power: 1000, effects: [{ when: 'onLifeLost', conds: [], costs: [], actions: draw(1) }] });
C('Piège', { type: 'event', cost: 1, effects: [{ when: 'trigger', conds: [], costs: [], actions: draw(2) }] });
const deck = { Mur: 4, Guetteur: 4, Blessé: 4, Piège: 4 };
for (let i = 0; i < 9; i++) { C('P' + i, { type: 'character', cost: 1, power: 1000 }); deck['P' + i] = 4; }
deck.P8 = 2;
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
const winner = (await A.$('[data-do=first]')) ? A : B;
await winner.click(winner === A ? '[data-do=first]' : '[data-do=second]'); await A.waitForTimeout(300);
await A.click('[data-do=keep]'); await B.click('[data-do=keep]'); await A.waitForTimeout(600);

const W = (ms = 600) => A.waitForTimeout(ms);
const g = (p, f, a) => p.evaluate(f, a);
const hand = (p) => g(p, () => __optcg.G().me.hand.length);
const results = [];
const check = (label, ok, info = '') => results.push([ok ? 'OK ' : 'ÉCHEC', label, info]);
// Tour 3 (les attaques sont permises), cartes de test en place
for (const p of [A, B]) await g(p, () => { __optcg.G().turn.count = 3; __optcg.commit(); });
await g(B, () => { __optcg.place('Mur'); __optcg.place('Guetteur'); __optcg.place('Blessé'); });
await W();

async function attackLeader() {
  await A.click('.side.me .leader-zone .slot'); await A.click('#menu button:has-text("Attaquer")');
  await A.click('.side.opp .leader-zone .slot'); await W(400);
  await A.click('[data-do=send-atk]'); await W(900);
}

// 1) Attaque : « Quand l'adversaire attaque » + blocage avec [Bloquée]
let h0 = await hand(B);
await attackLeader();
const h1 = await hand(B);
check('« Quand l\'adversaire attaque » (pioche 1)', h1 === h0 + 1, `${h0}->${h1}`);
const wall = await B.$('.side.me .chars-row .slot:has-text("Mur")');
await wall.click();
const blockBtn = await B.$('#menu button:has-text("Bloquer")');
check('Bloquer proposé pour un [Bloqueur]', Boolean(blockBtn));
await blockBtn?.click(); await W(2600); // l’annonce BLOCKER dure 2 s
const h2 = await hand(B);
check('[Bloquée] (pioche 1)', h2 === h1 + 1, `${h1}->${h2}`);
await B.click('[data-do=resolve]'); await W(900);
check('Bloqueur 2000 KO par un Leader 5000', await g(B, () => !__optcg.G().me.chars.some((x) => x.c === 'Mur')));
check('combat terminé des deux côtés', !(await g(A, () => __optcg.G().battle)) && !(await g(B, () => __optcg.G().battle)));

// 2) Leader touché : Déclenchement depuis la Vie + « Quand vous perdez une Vie »
await g(A, () => { __optcg.G().me.leader.r = false; __optcg.commit(); });
await g(B, () => { const m = __optcg.G().me; m.life.push({ u: 'piege-test', c: 'Piège', r: false, d: 0 }); __optcg.commit(); });
const life0 = await g(B, () => __optcg.G().me.life.length);
h0 = await hand(B);
await attackLeader();
await B.click('[data-do=resolve]'); await W(2000);
const life1 = await g(B, () => __optcg.G().me.life.length);
const h3 = await hand(B);
check('le Leader perd 1 Vie', life1 === life0 - 1, `${life0}->${life1}`);
// +1 (Guetteur à l'attaque) +2 (Déclenchement) +1 (Vie perdue) ; la carte Piège va à la défausse
check('Déclenchement (pioche 2) + Vie perdue (pioche 1)', h3 === h0 + 4, `${h0}->${h3}`);
check('la carte Déclenchement finit à la défausse', await g(B, () => __optcg.G().me.trash.some((x) => x.u === 'piege-test')));

// 3) Victoire : Leader touché sans Vie
await g(A, () => { __optcg.G().me.leader.r = false; __optcg.commit(); });
await g(B, () => { __optcg.G().me.life = []; __optcg.commit(); });
await attackLeader();
await B.click('[data-do=resolve]'); await W(1200);
const overA = await g(A, () => [__optcg.G().phase, __optcg.G().winner === __optcg.G().role]);
const overB = await g(B, () => [__optcg.G().phase, __optcg.G().winner === __optcg.G().role]);
check('victoire de A affichée chez A', overA[0] === 'over' && overA[1] === true, overA.join(','));
check('défaite de B affichée chez B', overB[0] === 'over' && overB[1] === false, overB.join(','));
check('écran de fin visible', Boolean(await A.$('.result.win')) && Boolean(await B.$('.result.lose')));

// 4) Revanche puis défaite par deck vide
await A.click('[data-do=rematch]'); await W(1200);
const w2 = (await A.$('[data-do=first]')) ? A : B;
await w2.click(w2 === A ? '[data-do=first]' : '[data-do=second]'); await W(400);
await A.click('[data-do=keep]'); await B.click('[data-do=keep]'); await W(800);
check('revanche : nouvelle partie en cours', (await g(A, () => __optcg.G().phase)) === 'play' && (await g(B, () => __optcg.G().phase)) === 'play');
const turnA = await g(A, () => __optcg.G().turn.player === __optcg.G().role);
const active = turnA ? A : B;
const passive = turnA ? B : A;
await g(passive, () => { __optcg.G().me.deck = []; });
await g(active, () => __optcg.endTurn()); await W(1500);
const lost = await g(passive, () => [__optcg.G().phase, __optcg.G().winner === __optcg.G().role]);
check('deck vide : défaite au moment de piocher', lost[0] === 'over' && lost[1] === false, lost.join(','));

console.log(results.map((r) => r.join(' | ')).join('\n'));
console.log('total', results.length, 'échecs', results.filter((r) => r[0] !== 'OK ').length);
console.log('ERREURS', errs);
await b.close();
