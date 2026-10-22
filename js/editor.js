// Onglet « Cartes » : création et édition des cartes de la collection.
import { S, saveCard, saveCards, deleteCard, onChange } from './store.js';
import {
  COLORS, TYPES, RARITIES, ATTRIBUTES, KEYWORDS, esc, uid, newCard, cardHTML, resizeImage, download, readJSONFile,
} from './cards.js';

const root = () => document.getElementById('tab-cards');
let cur = newCard();
let filter = { q: '', type: '', color: '', rarity: '' };

export function initEditor() {
  root().innerHTML = `
  <div class="editor">
    <form class="panel ed-form" autocomplete="off">
      <h2 id="ed-title">Nouvelle carte</h2>
      <div class="field"><label>Type</label>
        <div class="seg" id="ed-type">${Object.entries(TYPES).map(([k, v]) =>
          `<button type="button" data-type="${k}">${v}</button>`).join('')}</div></div>
      <div class="grid2">
        <div class="field"><label for="ed-name">Nom</label><input id="ed-name" maxlength="60" placeholder="Ex. : Capitaine Rokk"></div>
        <div class="field"><label for="ed-code">Numéro</label><input id="ed-code" maxlength="20" placeholder="Ex. : MC01-001"></div>
      </div>
      <div class="field"><label>Rareté</label>
        <div class="seg" id="ed-rarity">${Object.entries(RARITIES).map(([k, v]) =>
          `<button type="button" data-rarity="${k}" class="rb r-${k}">${v.label}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" id="ed-inb"> Peut sortir dans les boosters</label></div>
      <div class="field"><label>Couleur <small id="ed-cnote"></small></label>
        <div class="colors" id="ed-colors">${Object.entries(COLORS).map(([k, v]) =>
          `<button type="button" data-color="${k}" style="--c:${v.hex}">${v.label}</button>`).join('')}</div></div>
      <div class="grid3">
        <div class="field f-cost"><label for="ed-cost">Coût</label><input id="ed-cost" type="number" min="0" max="10"></div>
        <div class="field f-life"><label for="ed-life">Vie</label><input id="ed-life" type="number" min="1" max="10"></div>
        <div class="field f-power"><label for="ed-power">Puissance</label><input id="ed-power" type="number" min="0" step="1000"></div>
        <div class="field f-counter"><label for="ed-counter">Contre</label>
          <select id="ed-counter"><option value="0">Aucun</option><option value="1000">+1000</option><option value="2000">+2000</option></select></div>
        <div class="field f-attr"><label for="ed-attr">Attribut</label>
          <input id="ed-attr" list="ed-attrs"><datalist id="ed-attrs">${ATTRIBUTES.map((a) => `<option value="${a}">`).join('')}</datalist></div>
      </div>
      <div class="field"><label for="ed-traits">Types / Familles</label><input id="ed-traits" maxlength="80" placeholder="Ex. : Équipage du Requin / Marine"></div>
      <div class="field"><label for="ed-effect">Effet</label>
        <div class="kws">${KEYWORDS.map((k) => `<button type="button" data-kw="${esc(k)}">${esc(k)}</button>`).join('')}</div>
        <textarea id="ed-effect" rows="5" placeholder="[Jouée] Piochez 1 carte."></textarea></div>
      <div class="field f-trigger"><label for="ed-trigger">Déclenchement <small>(effet quand la carte est révélée depuis la Vie)</small></label>
        <textarea id="ed-trigger" rows="2" placeholder="Jouez cette carte."></textarea></div>
      <div class="field"><label>Image</label>
        <div class="row-btns">
          <label class="btn"><input type="file" id="ed-img" accept="image/*" hidden>Choisir une image…</label>
          <button type="button" class="btn ghost" id="ed-noimg">Retirer l'image</button>
        </div></div>
      <div class="row-btns sticky">
        <button type="submit" class="btn primary">Enregistrer</button>
        <button type="button" class="btn" id="ed-new">Nouvelle carte</button>
        <button type="button" class="btn ghost" id="ed-dup">Dupliquer</button>
        <button type="button" class="btn danger" id="ed-del">Supprimer</button>
      </div>
      <p class="msg" id="ed-msg" role="status"></p>
    </form>
    <div class="ed-preview"><div id="ed-card" class="big-card"></div></div>
    <section class="panel ed-list">
      <div class="list-head">
        <h2>Toutes les cartes du jeu <span id="ed-count" class="muted"></span></h2>
        <div class="row-btns">
          <button class="btn ghost" id="ed-legacy" title="Cartes créées avec la première version du site, dans ce navigateur">Récupérer l'ancienne version</button>
          <button class="btn ghost" id="ed-export">Exporter</button>
          <label class="btn ghost"><input type="file" id="ed-import" accept=".json,application/json" hidden>Importer</label>
        </div>
      </div>
      <div class="filters">
        <input id="ed-q" placeholder="Rechercher…" type="search">
        <select id="ed-ftype"><option value="">Tous types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select id="ed-frarity"><option value="">Toutes raretés</option>${Object.entries(RARITIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        <select id="ed-fcolor"><option value="">Toutes couleurs</option>${Object.entries(COLORS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
      </div>
      <div class="card-grid" id="ed-grid"></div>
    </section>
  </div>`;

  const r = root();
  const form = r.querySelector('form');
  const val = (id) => r.querySelector('#' + id);

  r.querySelector('#ed-type').addEventListener('click', (e) => {
    const t = e.target.closest('[data-type]')?.dataset.type;
    if (t) { cur.type = t; cur.colors = cur.colors.slice(0, maxColors()); fill(); }
  });
  r.querySelector('#ed-rarity').addEventListener('click', (e) => {
    const k = e.target.closest('[data-rarity]')?.dataset.rarity;
    if (k) { cur.rarity = k; fill(); }
  });
  r.querySelector('#ed-colors').addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]')?.dataset.color;
    if (!c) return;
    if (cur.colors.includes(c)) { if (cur.colors.length > 1) cur.colors = cur.colors.filter((x) => x !== c); }
    else cur.colors = [...cur.colors, c].slice(-maxColors());
    fill();
  });
  r.querySelector('.kws').addEventListener('click', (e) => {
    const k = e.target.closest('[data-kw]')?.dataset.kw;
    if (!k) return;
    const ta = val('ed-effect');
    const [a, b] = [ta.selectionStart, ta.selectionEnd];
    ta.value = ta.value.slice(0, a) + k + ' ' + ta.value.slice(b);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = a + k.length + 1;
    readForm();
  });
  form.addEventListener('input', readForm);
  val('ed-img').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    cur.image = await resizeImage(f);
    e.target.value = '';
    preview();
  });
  val('ed-noimg').addEventListener('click', () => { cur.image = ''; preview(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    readForm();
    if (!cur.name.trim()) return msg('Donnez un nom à la carte.', true);
    msg('Enregistrement…');
    try {
      const c = { ...cur, colors: cur.colors.slice(0, maxColors()) };
      await saveCard(c);
      cur.image = c.image;
      fill();
      msg(`« ${cur.name} » enregistrée.`);
    } catch (err) { msg(err.message, true); }
  });
  val('ed-new').addEventListener('click', () => { const t = cur.type; cur = newCard(); cur.type = t; fill(); msg(''); });
  val('ed-dup').addEventListener('click', () => {
    cur = { ...cur, id: uid(), colors: [...cur.colors], name: cur.name ? cur.name + ' (copie)' : '' };
    fill(); msg('Copie créée : pensez à enregistrer.');
  });
  val('ed-del').addEventListener('click', async () => {
    if (!S.byId[cur.id]) { cur = newCard(); fill(); return; }
    if (!confirm(`Supprimer « ${cur.name} » ?\n\nAttention : elle disparaîtra aussi de la collection de TOUS les joueurs qui la possèdent.`)) return;
    try {
      await deleteCard(cur.id);
      cur = newCard(); fill(); msg('Carte supprimée.');
    } catch (err) { msg(err.message, true); }
  });
  val('ed-legacy').addEventListener('click', async () => {
    try {
      const cards = await readLegacyCards();
      if (!cards.length) return msg('Aucune carte de l\'ancienne version dans ce navigateur.', true);
      msg(`Envoi de ${cards.length} carte(s) sur le serveur…`);
      await saveCards(cards);
      msg(`${cards.length} carte(s) récupérée(s).`);
    } catch (err) { msg(err.message, true); }
  });
  val('ed-export').addEventListener('click', () => {
    download('mes-cartes.json', { format: 'optcg-maison-cartes', cards: S.cards });
  });
  val('ed-import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = await readJSONFile(f);
      const cards = data.cards || [];
      if (!cards.length) throw new Error('Fichier vide ou invalide.');
      msg(`Import de ${cards.length} carte(s)… (les images sont envoyées sur le serveur, patientez)`);
      await saveCards(cards);
      msg(`${cards.length} carte(s) importée(s).`);
    } catch (err) { msg(err.message || 'Fichier invalide.', true); }
  });
  r.querySelector('.filters').addEventListener('input', () => {
    filter = {
      q: val('ed-q').value.toLowerCase(), type: val('ed-ftype').value, color: val('ed-fcolor').value, rarity: val('ed-frarity').value,
    };
    renderList();
  });
  val('ed-grid').addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    cur = structuredClone(S.byId[id]);
    fill(); msg('');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  onChange(renderList);
  fill();
  renderList();
}

// Seuls les Leaders peuvent être bicolores.
const maxColors = () => (cur.type === 'leader' ? 2 : 1);

function msg(t, err = false) {
  const m = root().querySelector('#ed-msg');
  m.textContent = t;
  m.classList.toggle('err', err);
}

function readForm() {
  const v = (id) => root().querySelector('#' + id).value;
  Object.assign(cur, {
    name: v('ed-name'), code: v('ed-code'), cost: +v('ed-cost') || 0, life: +v('ed-life') || 0,
    power: +v('ed-power') || 0, counter: +v('ed-counter') || 0, attribute: v('ed-attr'),
    traits: v('ed-traits'), effect: v('ed-effect'), trigger: v('ed-trigger'),
    inBoosters: root().querySelector('#ed-inb').checked,
  });
  preview();
}

function fill() {
  const r = root();
  const set = (id, x) => { r.querySelector('#' + id).value = x ?? ''; };
  set('ed-name', cur.name); set('ed-code', cur.code); set('ed-cost', cur.cost); set('ed-life', cur.life);
  set('ed-power', cur.power); set('ed-counter', cur.counter || 0); set('ed-attr', cur.attribute);
  set('ed-traits', cur.traits); set('ed-effect', cur.effect); set('ed-trigger', cur.trigger);
  r.querySelectorAll('#ed-type [data-type]').forEach((b) => b.classList.toggle('on', b.dataset.type === cur.type));
  r.querySelector('#ed-inb').checked = cur.inBoosters !== false;
  r.querySelectorAll('#ed-rarity [data-rarity]').forEach((b) => b.classList.toggle('on', b.dataset.rarity === (cur.rarity || 'C')));
  r.querySelector('#ed-cnote').textContent = cur.type === 'leader' ? '(1 ou 2 : un Leader peut être bicolore)' : '(une seule : seuls les Leaders peuvent être bicolores)';
  r.querySelectorAll('#ed-colors [data-color]').forEach((b) => b.classList.toggle('on', cur.colors.includes(b.dataset.color)));
  const t = cur.type;
  const show = (cls, yes) => { r.querySelector(cls).hidden = !yes; };
  show('.f-cost', t !== 'leader');
  show('.f-life', t === 'leader');
  show('.f-power', t === 'leader' || t === 'character');
  show('.f-counter', t === 'character');
  show('.f-attr', t === 'leader' || t === 'character');
  show('.f-trigger', t !== 'leader');
  r.querySelector('#ed-title').textContent = S.byId[cur.id] ? `Modifier « ${cur.name} »` : 'Nouvelle carte';
  preview();
}

function preview() {
  root().querySelector('#ed-card').innerHTML = cardHTML(cur);
}

function renderList() {
  const r = root();
  const list = S.cards.filter((c) => (!filter.type || c.type === filter.type)
    && (!filter.rarity || c.rarity === filter.rarity)
    && (!filter.color || c.colors.includes(filter.color))
    && (!filter.q || `${c.name} ${c.code} ${c.traits} ${c.effect}`.toLowerCase().includes(filter.q)));
  r.querySelector('#ed-count').textContent = `(${S.cards.length})`;
  r.querySelector('#ed-grid').innerHTML = list.length
    ? list.map((c) => `<button class="grid-card" data-id="${c.id}" title="${esc(c.name)}">${cardHTML(c)}</button>`).join('')
    : `<p class="muted">${S.cards.length ? 'Aucune carte ne correspond.' : 'Aucune carte pour l\'instant : créez-en une avec le formulaire.'}</p>`;
}

// Lit les cartes stockées localement par la première version du site (IndexedDB « optcg-maison »).
function readLegacyCards() {
  return new Promise((resolve) => {
    const r = indexedDB.open('optcg-maison');
    r.onerror = () => resolve([]);
    r.onupgradeneeded = () => { r.transaction.abort(); resolve([]); };
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('cards')) { db.close(); resolve([]); return; }
      const g = db.transaction('cards').objectStore('cards').getAll();
      g.onsuccess = () => { db.close(); resolve(g.result || []); };
      g.onerror = () => { db.close(); resolve([]); };
    };
  });
}
