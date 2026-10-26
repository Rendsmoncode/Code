import fs from 'fs';
// Parcours surprise de bout en bout : compte test préparé par le propriétaire (Game Master), lien ouvert →
// écran noir → lancement → booster géant → révélation du deck → interface → boosters → gameplay → mot de passe.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { makeMock } from './mock-supabase.mjs';
const SITE = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const VIDEO = process.env.VIDEO_DIR;
const mock = makeMock();
const C = (id, d, r = 'C') => { mock.st.cards[id] = { id, rarity: r, in_boosters: true, data: { name: id, colors: ['jaune'], type: 'character', cost: 1, power: 1000, counter: 1000, effects: [], ...d } }; };
for (let i = 0; i < 8; i++) C('B' + i, {}, ['C', 'UC', 'R', 'SR'][i % 4]);
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errs = []; const results = [];
const check = (l, ok, i = '') => results.push([ok ? 'OK ' : 'ÉCHEC', l, i]);
// Vidéo d'intro (Admin → Musiques) : un petit clip de 2 s servi à son adresse signée.
(mock.st.files ||= []).push('sons/intro-1.mp4');
const INTRO = fs.readFileSync(new URL('./intro-test.mp4', import.meta.url));
const mk = async (name, opts = {}) => { const ctx = await b.newContext(opts); await ctx.route(/supabase\.co/, mock.handle); await ctx.route(/unpkg\.com/, (r) => r.abort());
  await ctx.route(/object\/sign\/cards\/sons\/intro-/, (r) => r.fulfill({ status: 200, contentType: 'video/mp4', body: INTRO }));
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + e.message)); p.on('dialog', (d) => d.accept()); return { ctx, p }; };
const { p: A } = await mk('A', { viewport: { width: 1300, height: 900 } });
await A.goto(SITE + '?test=1');
await A.click('[data-mode=up]'); await A.fill('#au-user', 'ayoub'); await A.fill('#au-pass', 'secret1'); await A.fill('#au-pass2', 'secret1');
await A.click('.auth .btn.primary'); await A.waitForSelector('.top .who'); await A.waitForTimeout(500);
await A.evaluate(() => document.querySelector('[data-tab=gm]').click()); await A.waitForTimeout(400);
await A.click('[data-sp=test]'); await A.waitForSelector('.sp-link input', { timeout: 8000 });
const link = await A.inputValue('.sp-link input');
check('lien du compte test', /invite=/.test(link), link.slice(0, 60));
const { ctx: TC, p: T } = await mk('T', { viewport: process.env.PC ? { width: 1366, height: 768 } : { width: 390, height: 844 }, ...(VIDEO ? { recordVideo: { dir: VIDEO, size: process.env.PC ? { width: 1366, height: 768 } : { width: 390, height: 844 } } } : {}) });
const shot = (n) => (process.env.SHOTS ? T.screenshot({ path: `${process.env.SHOTS}/${n}` }) : null);
await T.goto(link.replace(/^.*\?/, SITE + '?test=1&'));
await T.waitForSelector('.sp-black-form', { timeout: 10000 }); await T.waitForTimeout(1300);
check('lien : écran noir avec seulement le mot de passe', await T.evaluate(() => !document.body.textContent.includes('Nakama') && !document.querySelector('.auth svg') && document.title !== 'Nakama TCG'));
await shot('0-motdepasse.png');
await T.fill('#au-pass', 'secret9'); await T.fill('#au-pass2', 'secret9'); await T.click('.sp-black-form .btn');
await T.waitForSelector('.sp-ov', { timeout: 10000 }); await T.waitForTimeout(1500);
check('écran noir, interface cachée', await T.evaluate(() => document.documentElement.classList.contains('sp-boot') && getComputedStyle(document.querySelector('.top')).visibility === 'hidden' && document.title !== 'Nakama TCG'));
const tu = Object.values(mock.st.users).find((x) => x.u.user_metadata.username === 'test');
check('mot de passe choisi au départ', tu?.pw === 'secret9');
await A.click('[data-sp=refresh]'); await A.waitForTimeout(400);
check('Game Master voit « test » en attente', (await A.textContent('.sp-list-gm')).includes('écran noir'));
await A.click('[data-sp=go]'); await A.waitForTimeout(300);
check('l\'intro vidéo passe avant le booster', await T.waitForSelector('.sp-intro-vid', { timeout: 6000 }).then(() => T.evaluate(() => !document.querySelector('.wpack.giant'))).catch(() => false));
await T.waitForSelector('.wpack.giant', { timeout: 12000 }); await T.waitForTimeout(4200);
check('booster géant blanc au prénom', (await T.textContent('.wp-name')).trim() === 'TEST');
await shot('1-booster.png');
await T.click('.wpack.giant', { force: true }); await T.waitForSelector('.bx', { timeout: 6000 }); await T.waitForTimeout(1300);
check('deck : nombre d\'exemplaires affiché', (await T.textContent('.bx-info')).includes('dans ton deck'));
await shot('2-deck.png');
async function finishReveal() {
  for (let k = 0; k < 40 && !(await T.$('[data-do=close]')); k++) {
    if (await T.$('[data-do=all]')) await T.click('[data-do=all]'); else await T.click('.bx-stage', { force: true }).catch(() => {});
    await T.waitForTimeout(700);
  }
  await T.click('[data-do=close]');
}
await finishReveal(); await T.waitForTimeout(1500);
await shot('3-interface.png');
await T.waitForSelector('.sp-coach', { timeout: 6000 }); await T.waitForTimeout(700);
check('bulle des boosters spéciaux', (await T.textContent('.sp-coach')).includes('boosters spéciaux'));
await T.click('.sp-coach button'); await T.waitForTimeout(500);
let packsOpened = 0;
for (;;) {
  const pk = await T.waitForSelector('.sp-rar .wpack, .sp-coach:not(.out)', { timeout: 6000 });
  if (await pk.evaluate((x) => x.classList.contains('sp-coach'))) break;
  await T.waitForTimeout(1700);
  if (!packsOpened) await shot('4-rarete.png');
  await T.click('.sp-rar .wpack', { force: true }); await T.waitForSelector('.bx', { timeout: 6000 }); await T.waitForTimeout(900);
  await finishReveal(); packsOpened++; await T.waitForTimeout(600);
}
const tid = tu.u.id;
check('boosters de rareté ouverts', packsOpened >= 3 && mock.st.profiles[tid].packs.every((x) => x.opened), `${packsOpened} ouverts`);
check('bulle des 10 boosters', (await T.textContent('.sp-coach')).includes('10 boosters'));
await T.click('.sp-coach button'); await T.waitForSelector('.bx', { timeout: 6000 }); await T.waitForTimeout(1200);
await T.click('[data-do=all]'); await T.waitForTimeout(800); await T.waitForSelector('[data-do=close]', { timeout: 15000 });
check('10 boosters ouverts', mock.st.stats[tid]?.boosters_opened === 10);
await T.click('[data-do=close]'); await T.waitForTimeout(1500);
check('surprise terminée', mock.st.profiles[tid].surprise === 'done');
check('jeu complet affiché, sans tuto', await T.evaluate(() => !document.body.classList.contains('surprise') && !document.querySelector('.sp-slide') && getComputedStyle(document.querySelector('.top')).visibility === 'visible' && document.title === 'Nakama TCG'));
await T.evaluate(() => document.querySelector('.settings-btn').click()); await T.waitForTimeout(300);
await T.click('[data-tuto]'); await T.waitForSelector('.sp-slide', { timeout: 3000 });
check('présentation du gameplay dans les paramètres', true);
await T.keyboard.press('Escape');
await A.click('[data-sp=retest]'); await A.waitForTimeout(500);
await T.reload(); await T.waitForSelector('.sp-ov', { timeout: 10000 }); await T.waitForTimeout(600);
check('« Rejouer » : retour sur l\'écran noir', await T.evaluate(() => document.body.classList.contains('surprise')));
check('« Rejouer » : boosters de rareté à nouveau fermés', (mock.st.profiles[tid].packs || []).length > 0 && mock.st.profiles[tid].packs.every((x) => !x.opened), JSON.stringify(mock.st.profiles[tid].packs));
await TC.close();
for (const r of results) console.log(r.join(' | '));
console.log('total', results.length, 'échecs', results.filter((r) => r[0] !== 'OK ').length);
console.log('ERREURS', JSON.stringify(errs));
await b.close();
