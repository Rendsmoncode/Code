// Teste les invitations personnelles (pseudo, deck de départ, boosters) et l'affichage des images privées.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { makeMock } from './mock-supabase.mjs';

const SITE = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const mock = makeMock();
const IMG = 'https://bhhakcbodwtmopstgetu.supabase.co/storage/v1/object/public/cards/c1-123.jpg';
const C = (id, d) => { mock.st.cards[id] = { id, rarity: 'C', in_boosters: true, data: { name: id, colors: ['rouge'], traits: 'Amis', attribute: 'Frappe', counter: 1000, effects: [], ...d } }; };
C('LeaderMathieu', { type: 'leader', name: 'Mathieu', life: 5, power: 5000, image: IMG });
const cards = {};
for (let i = 0; i < 13; i++) { C(`M${i}`, { type: 'character', cost: 1, power: 1000 }); cards[`M${i}`] = 4; }
cards.M12 = 2;
mock.st.starters.mat = { id: 'mat', name: 'Deck de Mathieu', leader: 'LeaderMathieu', cards };

const b = await chromium.launch();
const errs = [];
const results = [];
const check = (label, ok, info = '') => results.push([ok ? 'OK ' : 'ÉCHEC', label, info]);
async function browser() {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.route(/supabase\.co/, mock.handle);
  await ctx.route(/unpkg\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  return p;
}

// Le propriétaire (premier compte) crée une invitation pour « mathieu »
const owner = await browser();
await owner.goto(SITE);
await owner.click('[data-mode=up]'); await owner.fill('#au-user', 'ayoub'); await owner.fill('#au-pass', 'secret1'); await owner.fill('#au-pass2', 'secret1');
await owner.click('.auth .btn.primary'); await owner.waitForSelector('.who .logout');
await owner.keyboard.press('Escape');
await owner.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
await owner.click('[data-tab=admin]'); await owner.waitForTimeout(400);
await owner.fill('.iv-name', 'Mathieu'); await owner.selectOption('.iv-starter', 'mat'); await owner.fill('.iv-n', '10');
await owner.click('.iv-form .btn.primary'); await owner.waitForTimeout(500);
const link = await owner.inputValue('.iv-new input');
check('lien d\'invitation créé', /\?invite=[0-9a-f-]{36}$/.test(link.replace(/^file:\/\/.*index\.html/, '')), link.slice(-50));
check('invitation listée « En attente »', (await owner.textContent('.iv-list')).includes('En attente'));

// Sans invitation : impossible de créer un compte
const intrus = await browser();
await intrus.goto(SITE);
await intrus.click('[data-mode=up]'); await intrus.fill('#au-user', 'intrus'); await intrus.fill('#au-pass', 'secret9'); await intrus.fill('#au-pass2', 'secret9');
await intrus.click('.auth .btn.primary'); await intrus.waitForTimeout(600);
check('inscription refusée sans invitation', (await intrus.textContent('.au-msg')).includes('invitation'), await intrus.textContent('.au-msg'));

// Mathieu ouvre son lien dans un autre navigateur
const mat = await browser();
await mat.goto(SITE + link.slice(link.indexOf('?')));
await mat.waitForSelector('.invite-hello');
check('message de bienvenue avec deck et boosters', /mathieu.*Deck de Mathieu.*10 boosters/s.test(await mat.textContent('.invite-hello')), await mat.textContent('.invite-hello'));
check('pseudo pré-rempli et verrouillé', (await mat.inputValue('#au-user')) === 'mathieu' && (await mat.getAttribute('#au-user', 'readonly')) !== null);
await mat.fill('#au-pass', 'motdepasse'); await mat.fill('#au-pass2', 'motdepasse');
await mat.click('.auth .btn.primary'); await mat.waitForSelector('.who .logout');
check('connecté sous son pseudo', (await mat.textContent('.who')).includes('mathieu'));
check('pas de choix de deck (déjà reçu)', !(await mat.$('.starters')));
check('jeton retiré de l\'adresse', !mat.url().includes('invite='));
await mat.click('[data-tab=boosters]'); await mat.waitForTimeout(300);
check('10 boosters offerts, réserve gratuite à 0', (await mat.textContent('.bs-count')).includes('10 boosters') && (await mat.textContent('.bs-detail')).includes('Gratuits : 0'), (await mat.textContent('.bs-detail')).replace(/\s+/g, ' '));
await mat.click('[data-tab=decks]'); await mat.click('.deck-item'); await mat.waitForTimeout(300);
check('son deck est prêt et valide', (await mat.textContent('.dk-status')).includes('Deck valide'), (await mat.textContent('.dk-status')).replace(/\s+/g, ' ').trim());
const src = await mat.getAttribute('.dk-leader img', 'src');
check('image affichée par une adresse temporaire (privée)', String(src).includes('/object/sign/cards/c1-123.jpg?token='), src);

// Le lien ne sert qu'une fois
const again = await browser();
await again.goto(SITE + link.slice(link.indexOf('?')));
await again.waitForSelector('.auth-box');
check('lien déjà utilisé : refusé', (await again.textContent('.auth-box')).includes('plus valable'));
await owner.click('[data-tab=admin]'); await owner.waitForTimeout(500);
check('invitation marquée « Utilisée »', (await owner.textContent('.iv-list')).includes('Utilisée'));

console.log(results.map((r) => r.join(' | ')).join('\n'));
console.log('total', results.length, 'échecs', results.filter((r) => r[0] !== 'OK ').length);
console.log('ERREURS', errs);
await b.close();
