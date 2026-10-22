// Joue une partie à deux onglets avec des effets automatiques (Jouée, Attaque, Bloqueur, Contre).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
const SITE = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
import { makeMock } from './mock-supabase.mjs';
const mock = makeMock();
const C = (id, d, rarity = 'C') => { for (const k of (d.type === 'leader' || id === 'Sentinelle') ? [''] : ['', '2', '3']) mock.st.cards[id + k] = { id: id + k, rarity, in_boosters: true, data: { name: id, colors: ['rouge'], traits: 'Équipage', attribute: 'Frappe', counter: 1000, ...d } }; };
C('Leader', { type: 'leader', life: 4, power: 5000, effects: [{ when: 'yourTurn', conds: [], costs: [], actions: [{ k: 'power', t: { side: 'mine', who: 'self' }, amount: 1000, dur: 'turn' }] }] });
C('Pioche', { type: 'character', cost: 1, power: 2000, effects: [{ when: 'onPlay', conds: [], costs: [], actions: [{ k: 'draw', n: 2 }, { k: 'discard', n: 1, random: 'no' }] }] });
C('Garde', { type: 'character', cost: 1, power: 1000, keywords: ['blocker'], effects: [] });
C('Tueur', { type: 'character', cost: 2, power: 4000, keywords: ['rush'], effects: [{ when: 'onAttack', conds: [], costs: [], actions: [{ k: 'ko', t: { side: 'opp', who: 'chars', n: 1, f: { maxCost: 3 } } }] }] });
C('Contre', { type: 'event', cost: 0, effects: [{ when: 'counter', conds: [], costs: [], actions: [{ k: 'power', t: { side: 'mine', who: 'leaderOrChar', n: 1 }, amount: 3000, dur: 'battle' }] }] });
C('Sentinelle', { type: 'character', cost: 1, power: 3000, effects: [{ when: 'activateMain', once: true, conds: [], costs: [{ k: 'restDon', n: 1 }], actions: [{ k: 'power', t: { side: 'mine', who: 'self' }, amount: 2000, dur: 'turn' }] }] });
mock.st.starters.s1 = { id: 's1', name: 'Test', leader: 'Leader', cards: { Pioche: 4, Pioche2: 4, Pioche3: 4, Garde: 4, Garde2: 4, Garde3: 4, Tueur: 4, Tueur2: 4, Tueur3: 4, Contre: 4, Contre2: 4, Contre3: 2, Sentinelle: 4 } };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.route(/supabase\.co/, mock.handle); await ctx.route(/unpkg\.com/, (r) => r.abort());
const errs = [];
const mk = async (n) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(n + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return p; };
const A = await mk('A');
await A.goto(SITE);
await A.click('[data-mode=up]'); await A.fill('#au-user', 'ayoub'); await A.fill('#au-pass', 'secret1'); await A.fill('#au-pass2', 'secret1');
await A.click('.auth .btn.primary'); await A.waitForSelector('.starter'); await A.click('.starter'); await A.waitForTimeout(400);
await A.click('[data-tab=play]'); await A.click('#tab-play details summary'); await A.check('#lb-local'); await A.click('#lb-host'); await A.waitForSelector('.code');
const code = (await A.textContent('.code')).trim();
const B = await mk('B');
await B.goto(SITE + '?join=' + code + '&local=1'); await B.waitForSelector('#lb-join'); await B.click('#lb-join');
await A.waitForTimeout(800);
const first = (await A.$('[data-do=first]')) ? A : B; const second = first === A ? B : A;
await first.click('[data-do=first]'); await A.waitForTimeout(300);
await A.click('[data-do=keep]'); await B.click('[data-do=keep]'); await A.waitForTimeout(500);
const W = (ms = 400) => A.waitForTimeout(ms);
const hand = (p) => p.$$eval('.side.me .hcard .nm', (l) => l.map((x) => x.textContent.trim()));
const logs = async (p) => (await p.$$eval('#gm-log li', (l) => l.map((x) => x.textContent.trim()))).slice(-6).join(' | ');
// Résout toutes les fenêtres ouvertes : choix de cartes (prend les premières) et confirmations.
async function settle(p, pick = 'first') {
  for (let k = 0; k < 6; k++) {
    await p.waitForTimeout(250);
    const dlg = await p.$('.overlay .dialog');
    if (!dlg) return;
    const picks = await p.$$('.overlay .grid-card.pick:not(.off)');
    if (picks.length) { await picks[0].click(); await p.click('.overlay [data-ok]'); continue; }
    const prim = await p.$('.overlay .btn.primary'); if (prim) { await prim.click(); continue; }
    return;
  }
}
async function play(p, cardName) {
  const cards = await p.$$('.side.me .hcard');
  for (const c of cards) { if ((await c.$eval('.nm', (x) => x.textContent.trim())) === cardName.toUpperCase() || (await c.$eval('.nm', (x) => x.textContent.trim())).toLowerCase() === cardName.toLowerCase()) {
    await c.click(); const btn = await p.$('#menu button:has-text("Jouer (coût")'); if (!btn) { await p.keyboard.press('Escape'); await p.mouse.click(3, 3); return false; } await btn.click(); await settle(p); return true; } }
  return false;
}
const count = (p, sel) => p.$eval(sel, (x) => x.textContent.trim()).catch(() => '?');
console.log('main 1er :', await hand(first));
// Tour 1 : jouer Pioche (pioche 2, défausse 1)
const h0 = (await hand(first)).length;
const okP = await play(first, 'Pioche');
console.log('Pioche jouée :', okP, '| main', h0, '->', (await hand(first)).length, '| défausse', await count(first, '.side.me .p-trash .count'));
console.log('journal :', await logs(first));
// Pile deck verrouillée ?
await first.click('.side.me .p-deck'); console.log('menu deck :', await first.textContent('#menu')); await first.mouse.click(3, 3);
await first.click('[data-do=end]'); await W(600);
// Tour 2 : second joue Garde (et Sentinelle si possible)
console.log('main 2nd :', await hand(second));
console.log('Garde jouée :', await play(second, 'Garde'));
console.log('Sentinelle jouée :', await play(second, 'Sentinelle'));
const sent = await second.$('.side.me .chars-row .slot:has-text("Sentinelle")');
if (sent) { await sent.click(); const act = await second.$('#menu button:has-text("✨")'); console.log('effet activable proposé :', !!act); if (act) { await act.click(); await settle(second); } else await second.mouse.click(3, 3); }
console.log('journal 2nd :', await logs(second));
await second.click('[data-do=end]'); await W(600);
// Tour 3 : first joue Tueur (Initiative) et attaque le leader adverse : effet [Attaque] KO un Personnage adverse coût ≤ 3
console.log('Tueur joué :', await play(first, 'Tueur'));
const oppCharsBefore = await first.$$eval('.side.opp .chars-row .slot:not(.free)', (l) => l.length);
const killer = await first.$('.side.me .chars-row .slot:has-text("Tueur")');
if (killer) {
  await killer.click(); await first.click('#menu button:has-text("Attaquer")'); await first.click('.side.opp .leader-zone .slot'); await settle(first);
  await W(500);
  const oppCharsAfter = await first.$$eval('.side.opp .chars-row .slot:not(.free)', (l) => l.length);
  console.log('persos adverses', oppCharsBefore, '->', oppCharsAfter);
  await first.click('[data-do=send-atk]'); await W(500);
  // Défenseur : joue l'Événement Contre s'il l'a
  const evs = await second.$$('.side.me .hcard');
  let countered = false;
  for (const e of evs) { if ((await e.$eval('.nm', (x) => x.textContent.trim())) === "Contre") { await e.click(); const bt = await second.$('#menu button:has-text("Contre (Événement)")'); if (bt) { await bt.click(); await settle(second); countered = true; } break; } }
  console.log('Contre joué :', countered, '| défense affichée :', await second.textContent('.vs'));
  await second.click('[data-do=resolve]'); await settle(second); await W(500);
  console.log('journal défenseur :', await logs(second));
}
console.log('ERREURS', errs); await b.close();
