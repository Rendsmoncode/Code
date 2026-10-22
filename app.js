(() => {
  // js/store.js
  var DB_NAME = "optcg-maison";
  var dbPromise;
  function openDb() {
    dbPromise || (dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("cards", { keyPath: "id" });
        r.result.createObjectStore("decks", { keyPath: "id" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
    return dbPromise;
  }
  async function run(store, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  var S = { cards: [], decks: [], byId: {} };
  var listeners = /* @__PURE__ */ new Set();
  var onChange = (fn) => listeners.add(fn);
  var emit = () => listeners.forEach((fn) => fn());
  function reindex() {
    S.cards.sort((a, b) => (a.code || "").localeCompare(b.code || "") || (a.name || "").localeCompare(b.name || ""));
    S.byId = Object.fromEntries(S.cards.map((c) => [c.id, c]));
  }
  async function load() {
    S.cards = await run("cards", "readonly", (s) => s.getAll()) || [];
    S.decks = await run("decks", "readonly", (s) => s.getAll()) || [];
    reindex();
  }
  async function saveCards(cards) {
    await run("cards", "readwrite", (s) => {
      cards.forEach((c) => s.put(c));
    });
    for (const c of cards) {
      const i = S.cards.findIndex((x) => x.id === c.id);
      if (i >= 0) S.cards[i] = c;
      else S.cards.push(c);
    }
    reindex();
    emit();
  }
  var saveCard = (c) => saveCards([c]);
  async function deleteCard(id) {
    await run("cards", "readwrite", (s) => s.delete(id));
    S.cards = S.cards.filter((c) => c.id !== id);
    reindex();
    emit();
  }
  async function saveDeck(d) {
    await run("decks", "readwrite", (s) => s.put(d));
    const i = S.decks.findIndex((x) => x.id === d.id);
    if (i >= 0) S.decks[i] = d;
    else S.decks.push(d);
    emit();
  }
  async function deleteDeck(id) {
    await run("decks", "readwrite", (s) => s.delete(id));
    S.decks = S.decks.filter((d) => d.id !== id);
    emit();
  }
  function validateDeck(deck) {
    const errs = [];
    const leader = S.byId[deck.leader];
    if (!leader) errs.push("Choisissez un Leader.");
    let total = 0;
    const perCode = {};
    for (const [id, n] of Object.entries(deck.cards || {})) {
      const c = S.byId[id];
      if (!c) {
        errs.push("Une carte du deck n'existe plus dans la collection.");
        continue;
      }
      total += n;
      const key = c.code || c.id;
      perCode[key] = (perCode[key] || 0) + n;
      if (perCode[key] > 4) errs.push(`\xAB ${c.name} \xBB : 4 exemplaires maximum.`);
      if (c.type === "leader") errs.push(`\xAB ${c.name} \xBB est un Leader : il ne va pas dans le deck.`);
      if (leader && !c.colors.some((x) => leader.colors.includes(x))) {
        errs.push(`\xAB ${c.name} \xBB n'a aucune couleur du Leader.`);
      }
    }
    if (total !== 50) errs.push(`Le deck contient ${total} cartes : il en faut exactement 50.`);
    return { ok: errs.length === 0, errs: [...new Set(errs)], total };
  }

  // js/cards.js
  var COLORS = {
    rouge: { label: "Rouge", hex: "#c8302c" },
    vert: { label: "Vert", hex: "#178a4c" },
    bleu: { label: "Bleu", hex: "#2364c4" },
    violet: { label: "Violet", hex: "#7a3db0" },
    noir: { label: "Noir", hex: "#2f2f36" },
    jaune: { label: "Jaune", hex: "#d9a90f" }
  };
  var TYPES = {
    leader: "Leader",
    character: "Personnage",
    event: "\xC9v\xE9nement",
    stage: "Lieu"
  };
  var ATTRIBUTES = ["Frappe", "Tranchant", "Distance", "Sp\xE9cial", "Sagesse"];
  var KEYWORDS = [
    "[Bloqueur]",
    "[Initiative]",
    "[Double attaque]",
    "[Exil]",
    "[Jou\xE9e]",
    "[Attaque]",
    "[Bloqu\xE9e]",
    "[KO]",
    "[Activation : Principale]",
    "[Principale]",
    "[Contre]",
    "[D\xE9clenchement]",
    "[Fin de votre tour]",
    "[Tour de l'adversaire]",
    "[Votre tour]",
    "[Une fois par tour]",
    "[DON!! x1]",
    "[DON!! x2]",
    "\u2460",
    "\u2461"
  ];
  var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  var hasWord = (card, words) => {
    const t = `${card?.effect || ""}`.toLowerCase();
    return words.some((w) => t.includes(w));
  };
  var isBlocker = (c) => hasWord(c, ["[bloqueur]", "[blocker]"]);
  var hasRush = (c) => hasWord(c, ["[initiative]", "[rush]"]);
  var hasDoubleAttack = (c) => hasWord(c, ["[double attaque]", "[double attack]"]);
  var hasBanish = (c) => hasWord(c, ["[exil]", "[banish]"]);
  function newCard() {
    return {
      id: uid(),
      code: "",
      name: "",
      type: "character",
      colors: ["rouge"],
      cost: 1,
      life: 5,
      power: 1e3,
      counter: 1e3,
      attribute: "Frappe",
      traits: "",
      effect: "",
      trigger: "",
      image: "",
      updated: Date.now()
    };
  }
  function fmtEffect(txt) {
    return esc(txt).replace(/\[([^\]]+)\]/g, '<span class="kw">$1</span>').replace(/\n/g, "<br>");
  }
  function colorBg(colors) {
    const hex = (colors?.length ? colors : ["noir"]).map((c) => COLORS[c]?.hex || "#555");
    return hex.length > 1 ? `linear-gradient(135deg, ${hex[0]} 0 50%, ${hex[1]} 50% 100%)` : hex[0];
  }
  function cardHTML(card, o = {}) {
    if (!card) return `<div class="card back ${o.cls || ""}" ${o.attrs || ""}><div class="frame"></div></div>`;
    const t = card.type;
    const corner = t === "leader" ? `<div class="corner life" title="Vie">${esc(card.life)}</div>` : `<div class="corner cost" title="Co\xFBt">${esc(card.cost ?? 0)}</div>`;
    let pow = "";
    if (t === "leader" || t === "character") {
      const base = Number(card.power) || 0;
      const shown = o.power ?? base;
      const diff = shown > base ? " up" : shown < base ? " down" : "";
      pow = `<div class="pow${diff}" title="Puissance">${shown}</div>`;
    }
    const ctr = t === "character" && Number(card.counter) > 0 ? `<div class="ctr" title="Contre">+${esc(card.counter)}</div>` : "";
    const attr = (t === "leader" || t === "character") && card.attribute ? `<div class="attr">${esc(card.attribute)}</div>` : "";
    const trig = card.trigger && t !== "leader" ? `<div class="trg"><span class="kw trig">D\xE9clenchement</span> ${fmtEffect(card.trigger)}</div>` : "";
    const art = card.image ? ` style="background-image:url('${card.image}')"` : "";
    return `<div class="card t-${t} ${o.cls || ""}" style="--bg:${colorBg(card.colors)}" ${o.attrs || ""}>
    <div class="frame">
      <div class="art${card.image ? "" : " empty"}"${art}></div>
      ${corner}${pow}${ctr}${attr}
      <div class="info">
        <div class="nm">${esc(card.name || "Sans nom")}</div>
        <div class="tl">${TYPES[t] || ""}${card.traits ? " \xB7 " + esc(card.traits) : ""}${card.code ? " \xB7 " + esc(card.code) : ""}</div>
        <div class="fx">${fmtEffect(card.effect)}</div>
        ${trig}
      </div>
    </div>
  </div>`;
  }
  function resizeImage(file, max = 500) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / img.width);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  function download(filename, data) {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  }
  function readJSONFile(file) {
    return file.text().then((t) => JSON.parse(t));
  }

  // js/editor.js
  var root = () => document.getElementById("tab-cards");
  var cur = newCard();
  var filter = { q: "", type: "", color: "" };
  function initEditor() {
    root().innerHTML = `
  <div class="editor">
    <form class="panel ed-form" autocomplete="off">
      <h2 id="ed-title">Nouvelle carte</h2>
      <div class="field"><label>Type</label>
        <div class="seg" id="ed-type">${Object.entries(TYPES).map(([k, v]) => `<button type="button" data-type="${k}">${v}</button>`).join("")}</div></div>
      <div class="grid2">
        <div class="field"><label for="ed-name">Nom</label><input id="ed-name" maxlength="60" placeholder="Ex. : Capitaine Rokk"></div>
        <div class="field"><label for="ed-code">Num\xE9ro</label><input id="ed-code" maxlength="20" placeholder="Ex. : MC01-001"></div>
      </div>
      <div class="field"><label>Couleur(s) <small>(2 max)</small></label>
        <div class="colors" id="ed-colors">${Object.entries(COLORS).map(([k, v]) => `<button type="button" data-color="${k}" style="--c:${v.hex}">${v.label}</button>`).join("")}</div></div>
      <div class="grid3">
        <div class="field f-cost"><label for="ed-cost">Co\xFBt</label><input id="ed-cost" type="number" min="0" max="10"></div>
        <div class="field f-life"><label for="ed-life">Vie</label><input id="ed-life" type="number" min="1" max="10"></div>
        <div class="field f-power"><label for="ed-power">Puissance</label><input id="ed-power" type="number" min="0" step="1000"></div>
        <div class="field f-counter"><label for="ed-counter">Contre</label>
          <select id="ed-counter"><option value="0">Aucun</option><option value="1000">+1000</option><option value="2000">+2000</option></select></div>
        <div class="field f-attr"><label for="ed-attr">Attribut</label>
          <input id="ed-attr" list="ed-attrs"><datalist id="ed-attrs">${ATTRIBUTES.map((a) => `<option value="${a}">`).join("")}</datalist></div>
      </div>
      <div class="field"><label for="ed-traits">Types / Familles</label><input id="ed-traits" maxlength="80" placeholder="Ex. : \xC9quipage du Requin / Marine"></div>
      <div class="field"><label for="ed-effect">Effet</label>
        <div class="kws">${KEYWORDS.map((k) => `<button type="button" data-kw="${esc(k)}">${esc(k)}</button>`).join("")}</div>
        <textarea id="ed-effect" rows="5" placeholder="[Jou\xE9e] Piochez 1 carte."></textarea></div>
      <div class="field f-trigger"><label for="ed-trigger">D\xE9clenchement <small>(effet quand la carte est r\xE9v\xE9l\xE9e depuis la Vie)</small></label>
        <textarea id="ed-trigger" rows="2" placeholder="Jouez cette carte."></textarea></div>
      <div class="field"><label>Image</label>
        <div class="row-btns">
          <label class="btn"><input type="file" id="ed-img" accept="image/*" hidden>Choisir une image\u2026</label>
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
        <h2>Ma collection <span id="ed-count" class="muted"></span></h2>
        <div class="row-btns">
          <button class="btn ghost" id="ed-export">Exporter</button>
          <label class="btn ghost"><input type="file" id="ed-import" accept=".json,application/json" hidden>Importer</label>
        </div>
      </div>
      <div class="filters">
        <input id="ed-q" placeholder="Rechercher\u2026" type="search">
        <select id="ed-ftype"><option value="">Tous types</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <select id="ed-fcolor"><option value="">Toutes couleurs</option>${Object.entries(COLORS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select>
      </div>
      <div class="card-grid" id="ed-grid"></div>
    </section>
  </div>`;
    const r = root();
    const form = r.querySelector("form");
    const val = (id) => r.querySelector("#" + id);
    r.querySelector("#ed-type").addEventListener("click", (e) => {
      const t = e.target.closest("[data-type]")?.dataset.type;
      if (t) {
        cur.type = t;
        fill();
      }
    });
    r.querySelector("#ed-colors").addEventListener("click", (e) => {
      const c = e.target.closest("[data-color]")?.dataset.color;
      if (!c) return;
      if (cur.colors.includes(c)) {
        if (cur.colors.length > 1) cur.colors = cur.colors.filter((x) => x !== c);
      } else cur.colors = [...cur.colors, c].slice(-2);
      fill();
    });
    r.querySelector(".kws").addEventListener("click", (e) => {
      const k = e.target.closest("[data-kw]")?.dataset.kw;
      if (!k) return;
      const ta = val("ed-effect");
      const [a, b] = [ta.selectionStart, ta.selectionEnd];
      ta.value = ta.value.slice(0, a) + k + " " + ta.value.slice(b);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = a + k.length + 1;
      readForm();
    });
    form.addEventListener("input", readForm);
    val("ed-img").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      cur.image = await resizeImage(f);
      e.target.value = "";
      preview();
    });
    val("ed-noimg").addEventListener("click", () => {
      cur.image = "";
      preview();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      readForm();
      if (!cur.name.trim()) return msg("Donnez un nom \xE0 la carte.", true);
      cur.updated = Date.now();
      await saveCard({ ...cur, colors: [...cur.colors] });
      msg(`\xAB ${cur.name} \xBB enregistr\xE9e.`);
    });
    val("ed-new").addEventListener("click", () => {
      const t = cur.type;
      cur = newCard();
      cur.type = t;
      fill();
      msg("");
    });
    val("ed-dup").addEventListener("click", () => {
      cur = { ...cur, id: uid(), colors: [...cur.colors], name: cur.name ? cur.name + " (copie)" : "" };
      fill();
      msg("Copie cr\xE9\xE9e : pensez \xE0 enregistrer.");
    });
    val("ed-del").addEventListener("click", async () => {
      if (!S.byId[cur.id]) {
        cur = newCard();
        fill();
        return;
      }
      if (!confirm(`Supprimer \xAB ${cur.name} \xBB ?`)) return;
      await deleteCard(cur.id);
      cur = newCard();
      fill();
      msg("Carte supprim\xE9e.");
    });
    val("ed-export").addEventListener("click", () => {
      download("mes-cartes.json", { format: "optcg-maison-cartes", cards: S.cards });
    });
    val("ed-import").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        const data = await readJSONFile(f);
        const cards = data.cards || [];
        if (!cards.length) throw new Error("vide");
        await saveCards(cards);
        msg(`${cards.length} carte(s) import\xE9e(s).`);
      } catch {
        msg("Fichier invalide.", true);
      }
    });
    r.querySelector(".filters").addEventListener("input", () => {
      filter = { q: val("ed-q").value.toLowerCase(), type: val("ed-ftype").value, color: val("ed-fcolor").value };
      renderList();
    });
    val("ed-grid").addEventListener("click", (e) => {
      const id = e.target.closest("[data-id]")?.dataset.id;
      if (!id) return;
      cur = structuredClone(S.byId[id]);
      fill();
      msg("");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    onChange(renderList);
    fill();
    renderList();
  }
  function msg(t, err = false) {
    const m = root().querySelector("#ed-msg");
    m.textContent = t;
    m.classList.toggle("err", err);
  }
  function readForm() {
    const v = (id) => root().querySelector("#" + id).value;
    Object.assign(cur, {
      name: v("ed-name"),
      code: v("ed-code"),
      cost: +v("ed-cost") || 0,
      life: +v("ed-life") || 0,
      power: +v("ed-power") || 0,
      counter: +v("ed-counter") || 0,
      attribute: v("ed-attr"),
      traits: v("ed-traits"),
      effect: v("ed-effect"),
      trigger: v("ed-trigger")
    });
    preview();
  }
  function fill() {
    const r = root();
    const set = (id, x) => {
      r.querySelector("#" + id).value = x ?? "";
    };
    set("ed-name", cur.name);
    set("ed-code", cur.code);
    set("ed-cost", cur.cost);
    set("ed-life", cur.life);
    set("ed-power", cur.power);
    set("ed-counter", cur.counter || 0);
    set("ed-attr", cur.attribute);
    set("ed-traits", cur.traits);
    set("ed-effect", cur.effect);
    set("ed-trigger", cur.trigger);
    r.querySelectorAll("#ed-type [data-type]").forEach((b) => b.classList.toggle("on", b.dataset.type === cur.type));
    r.querySelectorAll("#ed-colors [data-color]").forEach((b) => b.classList.toggle("on", cur.colors.includes(b.dataset.color)));
    const t = cur.type;
    const show2 = (cls, yes) => {
      r.querySelector(cls).hidden = !yes;
    };
    show2(".f-cost", t !== "leader");
    show2(".f-life", t === "leader");
    show2(".f-power", t === "leader" || t === "character");
    show2(".f-counter", t === "character");
    show2(".f-attr", t === "leader" || t === "character");
    show2(".f-trigger", t !== "leader");
    r.querySelector("#ed-title").textContent = S.byId[cur.id] ? `Modifier \xAB ${cur.name} \xBB` : "Nouvelle carte";
    preview();
  }
  function preview() {
    root().querySelector("#ed-card").innerHTML = cardHTML(cur);
  }
  function renderList() {
    const r = root();
    const list = S.cards.filter((c) => (!filter.type || c.type === filter.type) && (!filter.color || c.colors.includes(filter.color)) && (!filter.q || `${c.name} ${c.code} ${c.traits} ${c.effect}`.toLowerCase().includes(filter.q)));
    r.querySelector("#ed-count").textContent = `(${S.cards.length})`;
    r.querySelector("#ed-grid").innerHTML = list.length ? list.map((c) => `<button class="grid-card" data-id="${c.id}" title="${esc(c.name)}">${cardHTML(c)}</button>`).join("") : `<p class="muted">${S.cards.length ? "Aucune carte ne correspond." : "Aucune carte pour l'instant : cr\xE9ez-en une avec le formulaire."}</p>`;
  }

  // js/decks.js
  var root2 = () => document.getElementById("tab-decks");
  var curId = null;
  var filter2 = { q: "", type: "" };
  var cur2 = () => S.decks.find((d) => d.id === curId);
  function initDecks() {
    root2().innerHTML = `
  <div class="decks">
    <aside class="panel deck-side">
      <h2>Mes decks</h2>
      <div id="dk-list" class="deck-list"></div>
      <div class="row-btns">
        <button class="btn primary" id="dk-new">Nouveau deck</button>
        <label class="btn ghost"><input type="file" id="dk-import" accept=".json,application/json" hidden>Importer un deck</label>
      </div>
      <p class="muted small">Un deck export\xE9 contient aussi ses cartes : votre ami peut l'importer directement.</p>
    </aside>
    <section class="panel deck-main" id="dk-main"></section>
  </div>`;
    const r = root2();
    r.querySelector("#dk-new").addEventListener("click", async () => {
      const d = { id: uid(), name: `Deck ${S.decks.length + 1}`, leader: "", cards: {} };
      curId = d.id;
      await saveDeck(d);
    });
    r.querySelector("#dk-list").addEventListener("click", (e) => {
      const id = e.target.closest("[data-deck]")?.dataset.deck;
      if (id) {
        curId = id;
        render();
      }
    });
    r.querySelector("#dk-import").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        const data = await readJSONFile(f);
        if (!data.deck) throw new Error("pas un deck");
        if (data.cards?.length) await saveCards(data.cards);
        const d = { ...data.deck, id: uid() };
        curId = d.id;
        await saveDeck(d);
      } catch {
        alert("Fichier de deck invalide.");
      }
    });
    r.querySelector("#dk-main").addEventListener("click", onMainClick);
    r.querySelector("#dk-main").addEventListener("input", onMainInput);
    onChange(render);
    render();
  }
  async function onMainClick(e) {
    const d = cur2();
    if (!d) return;
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const { act, id } = t.dataset;
    if (act === "add") {
      const c = S.byId[id];
      if (c.type === "leader") d.leader = id;
      else d.cards[id] = Math.min(4, (d.cards[id] || 0) + 1);
    } else if (act === "rm") {
      d.cards[id] = (d.cards[id] || 0) - 1;
      if (d.cards[id] <= 0) delete d.cards[id];
    } else if (act === "unleader") {
      d.leader = "";
    } else if (act === "export") {
      const ids = [d.leader, ...Object.keys(d.cards)].filter((x) => S.byId[x]);
      download(
        `${d.name.replace(/[^\w-]+/g, "_") || "deck"}.json`,
        { format: "optcg-maison-deck", deck: d, cards: ids.map((x) => S.byId[x]) }
      );
      return;
    } else if (act === "delete") {
      if (!confirm(`Supprimer le deck \xAB ${d.name} \xBB ?`)) return;
      curId = null;
      await deleteDeck(d.id);
      return;
    } else return;
    await saveDeck(d);
  }
  var nameTimer;
  function onMainInput(e) {
    const d = cur2();
    if (e.target.id === "dk-name" && d) {
      d.name = e.target.value;
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => saveDeck(d), 400);
    }
    if (e.target.closest(".filters")) {
      const r = root2();
      filter2 = { q: r.querySelector("#dk-q").value.toLowerCase(), type: r.querySelector("#dk-ftype").value };
      renderPool();
    }
  }
  function render() {
    const r = root2();
    r.querySelector("#dk-list").innerHTML = S.decks.length ? S.decks.map((d2) => {
      const v2 = validateDeck(d2);
      const l2 = S.byId[d2.leader];
      return `<button class="deck-item${d2.id === curId ? " on" : ""}" data-deck="${d2.id}">
      <span class="dot" style="--bg:${l2 ? COLORS[l2.colors[0]]?.hex : "#666"}"></span>
      <span class="dn">${esc(d2.name)}</span>
      <span class="badge ${v2.ok ? "ok" : "ko"}">${v2.total}/50</span></button>`;
    }).join("") : '<p class="muted">Aucun deck.</p>';
    const main = r.querySelector("#dk-main");
    const d = cur2();
    if (!d) {
      main.innerHTML = `<p class="muted">Cr\xE9ez ou s\xE9lectionnez un deck. ${S.cards.length ? "" : "Commencez par cr\xE9er des cartes dans l'onglet <b>Cartes</b> (au moins un Leader)."}</p>`;
      return;
    }
    if (main.dataset.deck !== d.id) {
      main.dataset.deck = d.id;
      main.innerHTML = `
      <div class="list-head">
        <input id="dk-name" class="title-input" maxlength="40" aria-label="Nom du deck">
        <div class="row-btns">
          <button class="btn ghost" data-act="export">Exporter</button>
          <button class="btn danger" data-act="delete">Supprimer</button>
        </div>
      </div>
      <div id="dk-status"></div>
      <div class="deck-build">
        <div>
          <h3>Leader</h3><div id="dk-leader"></div>
          <h3>Contenu <span class="muted small">(cliquer pour retirer 1)</span></h3>
          <div id="dk-content" class="deck-content"></div>
        </div>
        <div>
          <h3>Ajouter des cartes <span class="muted small">(cliquer pour ajouter 1)</span></h3>
          <div class="filters">
            <input id="dk-q" type="search" placeholder="Rechercher\u2026">
            <select id="dk-ftype"><option value="">Tous types</option>${Object.entries(TYPES).map(([k, v2]) => `<option value="${k}">${v2}</option>`).join("")}</select>
          </div>
          <div id="dk-pool" class="card-grid small"></div>
        </div>
      </div>`;
      main.querySelector("#dk-name").value = d.name;
    }
    const v = validateDeck(d);
    main.querySelector("#dk-status").innerHTML = `
    <div class="deck-count ${v.ok ? "ok" : ""}"><b>${v.total}</b> / 50 cartes ${v.ok ? "\xB7 Deck valide \u2713" : ""}</div>
    ${v.ok ? "" : `<ul class="errs">${v.errs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`}`;
    const l = S.byId[d.leader];
    main.querySelector("#dk-leader").innerHTML = l ? `<button class="grid-card" data-act="unleader" title="Retirer le Leader">${cardHTML(l)}</button>` : '<p class="muted small">Cliquez sur un Leader dans la liste de droite.</p>';
    const entries = Object.entries(d.cards).filter(([id]) => S.byId[id]).sort(([a], [b]) => S.byId[a].cost - S.byId[b].cost || S.byId[a].name.localeCompare(S.byId[b].name));
    main.querySelector("#dk-content").innerHTML = entries.length ? entries.map(([id, n]) => `<button class="grid-card" data-act="rm" data-id="${id}">${cardHTML(S.byId[id])}<span class="qty">\xD7${n}</span></button>`).join("") : '<p class="muted small">Vide.</p>';
    renderPool();
  }
  function renderPool() {
    const d = cur2();
    const pool = root2().querySelector("#dk-pool");
    if (!d || !pool) return;
    const leader = S.byId[d.leader];
    const list = S.cards.filter((c) => (!filter2.type || c.type === filter2.type) && (!filter2.q || `${c.name} ${c.code} ${c.traits} ${c.effect}`.toLowerCase().includes(filter2.q)) && (c.type === "leader" || !leader || c.colors.some((x) => leader.colors.includes(x))));
    pool.innerHTML = list.length ? list.map((c) => `<button class="grid-card" data-act="add" data-id="${c.id}">${cardHTML(c)}${d.cards[c.id] ? `<span class="qty">\xD7${d.cards[c.id]}</span>` : ""}</button>`).join("") : '<p class="muted small">Aucune carte disponible.</p>';
  }

  // js/net.js
  var PREFIX = "optcgm-";
  function randomCode() {
    const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join("");
  }
  function host(mode, h) {
    const code = randomCode();
    return mode === "local" ? localLink(code, true, h) : peerHost(code, h);
  }
  function join(mode, code, h) {
    return mode === "local" ? localLink(code, false, h) : peerJoin(code, h);
  }
  function wire(conn, h) {
    conn.on("open", () => h.onOpen());
    conn.on("data", (m) => h.onMessage(m));
    conn.on("close", () => h.onClose());
    conn.on("error", (e) => h.onError(String(e?.message || e)));
  }
  function peerHost(code, h) {
    const peer = new window.Peer(PREFIX + code);
    let conn = null;
    peer.on("open", () => h.onReady(code));
    peer.on("connection", (c) => {
      if (conn) {
        c.on("open", () => c.close());
        return;
      }
      conn = c;
      wire(c, h);
    });
    peer.on("error", (e) => h.onError(peerError(e)));
    return {
      send: (m) => conn?.open && conn.send(m),
      close: () => peer.destroy()
    };
  }
  function peerJoin(code, h) {
    const peer = new window.Peer();
    let conn = null;
    peer.on("open", () => {
      conn = peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true });
      wire(conn, h);
    });
    peer.on("error", (e) => h.onError(peerError(e)));
    return {
      send: (m) => conn?.open && conn.send(m),
      close: () => peer.destroy()
    };
  }
  function peerError(e) {
    if (e?.type === "peer-unavailable") return "Partie introuvable : v\xE9rifiez le code (ou l'h\xF4te a ferm\xE9 sa page).";
    if (e?.type === "unavailable-id") return "Code d\xE9j\xE0 utilis\xE9, r\xE9essayez.";
    if (e?.type === "network" || e?.type === "server-error") return "Impossible de joindre le serveur de connexion. V\xE9rifiez votre connexion Internet.";
    return `Erreur de connexion (${e?.type || e}).`;
  }
  function localLink(code, isHost, h) {
    const ch = new BroadcastChannel(PREFIX + code);
    const me = Math.random().toString(36).slice(2);
    let open = false;
    const post = (kind, data) => ch.postMessage({ from: me, kind, data });
    ch.onmessage = ({ data: m }) => {
      if (m.from === me) return;
      if (m.kind === "hi" && isHost && !open) {
        open = true;
        post("hi-back");
        h.onOpen();
      } else if (m.kind === "hi-back" && !isHost && !open) {
        open = true;
        h.onOpen();
      } else if (m.kind === "msg") h.onMessage(m.data);
      else if (m.kind === "bye") h.onClose();
    };
    if (isHost) setTimeout(() => h.onReady(code));
    else post("hi");
    addEventListener("beforeunload", () => post("bye"));
    return {
      send: (data) => post("msg", data),
      close: () => {
        post("bye");
        ch.close();
      }
    };
  }

  // js/game.js
  var root3 = () => document.getElementById("tab-play");
  var G = null;
  var link = null;
  var lobby = { status: "idle", code: "", error: "", deck: "", mode: "online" };
  var other = (r) => r === "host" ? "guest" : "host";
  var shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  var send = (m) => link?.send(m);
  var myTurn = () => G?.phase === "play" && G.turn.player === G.role;
  var oppTurn = () => G?.phase === "play" && G.turn.player === other(G.role);
  var myCard = (inst) => G.myCards[inst.c];
  var oppCard = (inst) => G.oppCards[inst.c];
  var power = (inst, card, ownerTurn) => (Number(card?.power) || 0) + (inst.m || 0) + (ownerTurn ? (inst.d || 0) * 1e3 : 0);
  var myPower = (inst) => power(inst, myCard(inst), myTurn());
  var oppPower = (inst) => power(inst, oppCard(inst), oppTurn());
  var name = (c) => `\xAB ${c?.name || "?"} \xBB`;
  var emptySide = () => ({
    leader: null,
    life: [],
    deck: [],
    hand: [],
    chars: [],
    stage: null,
    trash: [],
    donDeck: 10,
    donActive: 0,
    donRested: 0
  });
  function initPlay() {
    const p = new URLSearchParams(location.search);
    if (p.get("join")) lobby.joinCode = p.get("join");
    if (p.get("local")) lobby.mode = "local";
    onChange(() => {
      if (!G) renderLobby();
    });
    renderLobby();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && G?.select) {
        G.select = null;
        render2();
      }
    });
  }
  function renderLobby() {
    const decks = S.decks.map((d) => ({ d, v: validateDeck(d) }));
    if (!lobby.deck || !decks.find((x) => x.d.id === lobby.deck && x.v.ok)) lobby.deck = decks.find((x) => x.v.ok)?.d.id || "";
    const savedName = localStorage.getItem("optcgm-name") || "";
    const waiting = lobby.status === "waiting";
    const shareUrl = `${location.origin}${location.pathname}?join=${lobby.code}${lobby.mode === "local" ? "&local=1" : ""}`;
    root3().innerHTML = `
  <div class="lobby">
    <section class="panel">
      <h2>Jouer contre un ami</h2>
      <div class="grid2">
        <div class="field"><label for="lb-name">Votre pseudo</label><input id="lb-name" maxlength="20" value="${esc(savedName)}" placeholder="Pseudo"></div>
        <div class="field"><label for="lb-deck">Votre deck</label>
          <select id="lb-deck">${decks.map(({ d, v }) => `<option value="${d.id}" ${v.ok ? "" : "disabled"} ${d.id === lobby.deck ? "selected" : ""}>${esc(d.name)}${v.ok ? "" : ` (invalide : ${v.total}/50)`}</option>`).join("")}</select></div>
      </div>
      ${lobby.deck ? "" : `<p class="msg err">Il vous faut un deck valide (1 Leader + 50 cartes) : allez dans l'onglet <b>Decks</b>.</p>`}
      <div class="lobby-actions">
        <div class="box">
          <h3>Cr\xE9er une partie</h3>
          ${waiting ? `
            <p>Envoyez ce code (ou le lien) \xE0 votre ami :</p>
            <div class="code">${esc(lobby.code)}</div>
            <div class="row-btns"><input readonly value="${esc(shareUrl)}" id="lb-url"><button class="btn" id="lb-copy">Copier le lien</button></div>
            <p class="muted small">En attente de votre adversaire\u2026 Gardez cette page ouverte.</p>
            <button class="btn ghost" id="lb-cancel">Annuler</button>` : `<p class="muted">Vous obtenez un code \xE0 envoyer \xE0 votre ami.</p>
            <button class="btn primary" id="lb-host" ${lobby.deck && lobby.status === "idle" ? "" : "disabled"}>Cr\xE9er une partie</button>`}
        </div>
        <div class="box">
          <h3>Rejoindre une partie</h3>
          <p class="muted">Entrez le code re\xE7u de votre ami.</p>
          <div class="row-btns"><input id="lb-code" maxlength="6" placeholder="CODE" value="${esc(lobby.joinCode || "")}" class="code-input">
          <button class="btn primary" id="lb-join" ${lobby.deck && lobby.status === "idle" ? "" : "disabled"}>Rejoindre</button></div>
        </div>
      </div>
      ${lobby.status === "connecting" ? '<p class="msg">Connexion\u2026</p>' : ""}
      ${lobby.error ? `<p class="msg err">${esc(lobby.error)}</p>` : ""}
      <details class="small"><summary>Tester seul sur cet ordinateur</summary>
        <p class="muted">Cochez la case, cr\xE9ez une partie, puis ouvrez le lien dans un deuxi\xE8me onglet de ce navigateur.</p>
        <label><input type="checkbox" id="lb-local" ${lobby.mode === "local" ? "checked" : ""}> Mode local (deux onglets)</label>
      </details>
    </section>
  </div>`;
    const r = root3();
    r.querySelector("#lb-deck").addEventListener("change", (e) => {
      lobby.deck = e.target.value;
    });
    r.querySelector("#lb-name").addEventListener("input", (e) => localStorage.setItem("optcgm-name", e.target.value));
    r.querySelector("#lb-local").addEventListener("change", (e) => {
      lobby.mode = e.target.checked ? "local" : "online";
    });
    r.querySelector("#lb-code").addEventListener("input", (e) => {
      lobby.joinCode = e.target.value.toUpperCase();
    });
    r.querySelector("#lb-host")?.addEventListener("click", () => connect(true));
    r.querySelector("#lb-join")?.addEventListener("click", () => {
      if (!lobby.joinCode?.trim()) {
        lobby.error = "Entrez un code.";
        renderLobby();
        return;
      }
      connect(false, lobby.joinCode);
    });
    r.querySelector("#lb-copy")?.addEventListener("click", () => {
      navigator.clipboard?.writeText(shareUrl);
      r.querySelector("#lb-copy").textContent = "Copi\xE9 \u2713";
    });
    r.querySelector("#lb-cancel")?.addEventListener("click", () => {
      link?.close();
      link = null;
      G = null;
      Object.assign(lobby, { status: "idle", code: "", error: "" });
      renderLobby();
    });
  }
  function connect(isHost, code) {
    const deck = S.decks.find((d) => d.id === lobby.deck);
    if (!deck || !validateDeck(deck).ok) return;
    if (lobby.mode === "online" && !window.Peer) {
      lobby.error = "Le module de connexion n'a pas pu se charger. V\xE9rifiez votre connexion Internet et rechargez la page.";
      renderLobby();
      return;
    }
    G = newGame(isHost ? "host" : "guest", deck, localStorage.getItem("optcgm-name") || (isHost ? "Joueur 1" : "Joueur 2"));
    Object.assign(lobby, { status: "connecting", error: "" });
    renderLobby();
    const h = {
      onReady: (c) => {
        lobby.code = c;
        lobby.status = "waiting";
        renderLobby();
      },
      onOpen: () => {
        G.connected = true;
        lobby.status = "playing";
        send({ t: "hello", name: G.name, cards: G.myCards });
        sys("Connect\xE9. \xC9change des decks\u2026");
        render2();
      },
      onMessage: (m) => {
        try {
          onMsg(m);
        } catch (e) {
          console.error(e);
        }
      },
      onClose: () => {
        if (G) {
          G.disconnected = true;
          sys("Votre adversaire s'est d\xE9connect\xE9.");
          render2();
        }
      },
      onError: (t) => {
        if (G?.connected) {
          sys(t);
          render2();
          return;
        }
        link?.close();
        link = null;
        G = null;
        Object.assign(lobby, { status: "idle", error: t });
        renderLobby();
      }
    };
    link = isHost ? host(lobby.mode, h) : join(lobby.mode, code, h);
  }
  function newGame(role, deck, playerName) {
    const myCards = {};
    [deck.leader, ...Object.keys(deck.cards)].forEach((id) => {
      myCards[id] = S.byId[id];
    });
    return {
      role,
      name: playerName,
      deckDef: structuredClone(deck),
      myCards,
      oppCards: {},
      oppName: "Adversaire",
      connected: false,
      disconnected: false,
      oppHello: false,
      phase: "hello",
      // hello → choose → mulligan → ready → play → over
      coinWinner: null,
      first: null,
      turn: { player: null, count: 0 },
      me: emptySide(),
      opp: null,
      meReady: false,
      oppReady: false,
      battle: null,
      select: null,
      log: [],
      winner: null,
      reveals: [],
      preview: null
    };
  }
  function onMsg(m) {
    switch (m.t) {
      case "hello":
        G.oppName = m.name || "Adversaire";
        G.oppCards = m.cards || {};
        G.oppHello = true;
        sys(`${G.oppName} a rejoint la partie.`);
        if (G.role === "host") coinFlip();
        break;
      case "coin":
        applyCoin(m.winner);
        break;
      case "first":
        applyFirst(m.first);
        break;
      case "view":
        G.opp = m.v;
        break;
      case "ready":
        G.oppReady = true;
        maybeStart();
        break;
      case "turn":
        G.turn = { player: m.player, count: m.count };
        break;
      case "endTurn":
        beginTurn(m.count + 1);
        return;
      case "log":
        G.log.push({ who: "opp", text: m.text });
        break;
      case "chat":
        G.log.push({ who: "opp", text: m.text, chat: true });
        break;
      case "reveal":
        G.reveals.push({ id: uid(), c: m.c, why: m.why });
        break;
      case "attack":
        G.battle = { ...m.b, role: "def" };
        break;
      case "battleUpd":
        if (G.battle) Object.assign(G.battle, m.b);
        break;
      case "battleEnd":
        G.battle = null;
        G.select = null;
        break;
      case "gameover":
        G.phase = "over";
        G.winner = m.winner;
        G.overReason = m.reason;
        break;
      case "rematch":
        resetMatch();
        return;
      default:
        break;
    }
    render2();
  }
  function log(text) {
    G.log.push({ who: "me", text });
    send({ t: "log", text });
  }
  function sys(text) {
    G?.log.push({ who: "sys", text });
  }
  function pub() {
    const m = G.me;
    return {
      leader: m.leader,
      chars: m.chars,
      stage: m.stage,
      trash: m.trash,
      hand: m.hand.length,
      deck: m.deck.length,
      life: m.life.length,
      donDeck: m.donDeck,
      donActive: m.donActive,
      donRested: m.donRested,
      phase: G.phase
    };
  }
  function commit() {
    if (G.phase === "play" && G.me.deck.length === 0) {
      lose("Son deck est vide.");
      return;
    }
    send({ t: "view", v: pub() });
    render2();
  }
  function coinFlip() {
    const w = Math.random() < 0.5 ? "host" : "guest";
    send({ t: "coin", winner: w });
    applyCoin(w);
  }
  function applyCoin(w) {
    G.coinWinner = w;
    G.phase = "choose";
    sys(`Tirage au sort : ${w === G.role ? "vous gagnez" : `${G.oppName} gagne`}.`);
  }
  function chooseFirst(meFirst) {
    const f = meFirst ? G.role : other(G.role);
    send({ t: "first", first: f });
    applyFirst(f);
  }
  function applyFirst(f) {
    G.first = f;
    sys(`${f === G.role ? "Vous commencez" : `${G.oppName} commence`}.`);
    const me = G.me;
    const leaderId = G.deckDef.leader;
    me.leader = { u: uid(), c: leaderId, r: false, d: 0, m: 0 };
    me.deck = shuffle(Object.entries(G.deckDef.cards).flatMap(([c, n]) => Array.from({ length: n }, () => ({ u: uid(), c, r: false, d: 0, m: 0 }))));
    me.hand = me.deck.splice(0, 5);
    G.phase = "mulligan";
    commit();
  }
  function finishMulligan(redo) {
    const me = G.me;
    if (redo) {
      me.deck.push(...me.hand);
      me.hand = [];
      shuffle(me.deck);
      me.hand = me.deck.splice(0, 5);
      log("fait un mulligan.");
    } else log("garde sa main.");
    const n = Number(myCard(me.leader).life) || 5;
    for (let i = 0; i < n && me.deck.length; i++) me.life.push(me.deck.shift());
    G.phase = "ready";
    G.meReady = true;
    send({ t: "ready" });
    maybeStart();
    if (G.phase !== "play") commit();
  }
  function maybeStart() {
    if (!(G.meReady && G.oppReady) || G.phase !== "ready") return;
    G.phase = "play";
    if (G.first === G.role) beginTurn(1);
    else commit();
  }
  function fieldInsts() {
    return [G.me.leader, ...G.me.chars, G.me.stage].filter(Boolean);
  }
  function beginTurn(count) {
    const me = G.me;
    G.turn = { player: G.role, count };
    G.battle = null;
    send({ t: "turn", player: G.role, count });
    const first = count === 1;
    let back = 0;
    for (const i of fieldInsts()) {
      back += i.d || 0;
      i.d = 0;
      i.r = false;
    }
    me.donActive += me.donRested + back;
    me.donRested = 0;
    log(`\u2014 Tour ${count} : ${G.name} \u2014`);
    if (!first) {
      if (!me.deck.length) {
        lose("Plus de carte \xE0 piocher.");
        return;
      }
      me.hand.push(me.deck.shift());
    }
    const n = Math.min(first ? 1 : 2, me.donDeck);
    me.donDeck -= n;
    me.donActive += n;
    log(`${first ? "ne pioche pas (1er tour)" : "pioche 1 carte"} et re\xE7oit ${n} DON!!.`);
    commit();
  }
  function endTurn() {
    if (G.battle) return toast("Terminez le combat en cours d'abord.");
    for (const i of fieldInsts()) i.m = 0;
    log("termine son tour.");
    G.turn = { player: other(G.role), count: G.turn.count };
    G.select = null;
    commit();
    send({ t: "endTurn", count: G.turn.count });
  }
  function lose(reason) {
    if (G.phase === "over") return;
    G.phase = "over";
    G.winner = other(G.role);
    G.overReason = reason;
    G.battle = null;
    log(`a perdu : ${reason}`);
    send({ t: "gameover", winner: G.winner, reason });
    send({ t: "view", v: pub() });
    render2();
  }
  function resetMatch() {
    Object.assign(G, {
      phase: "hello",
      coinWinner: null,
      first: null,
      turn: { player: null, count: 0 },
      me: emptySide(),
      opp: null,
      meReady: false,
      oppReady: false,
      battle: null,
      select: null,
      winner: null,
      reveals: []
    });
    sys("Nouvelle partie !");
    if (G.role === "host") coinFlip();
    commit();
  }
  function locate(u) {
    const me = G.me;
    if (me.leader?.u === u) return { zone: "leader", inst: me.leader };
    if (me.stage?.u === u) return { zone: "stage", inst: me.stage };
    for (const z of ["hand", "chars", "trash", "life", "deck"]) {
      const i = me[z].findIndex((x) => x.u === u);
      if (i >= 0) return { zone: z, inst: me[z][i], idx: i };
    }
    return null;
  }
  function move(u, to, pos = "top") {
    const loc = locate(u);
    if (!loc || loc.zone === "leader") return null;
    const me = G.me;
    const { inst } = loc;
    if (loc.zone === "stage") me.stage = null;
    else me[loc.zone].splice(loc.idx, 1);
    if (loc.zone === "chars" || loc.zone === "stage") {
      me.donRested += inst.d || 0;
      Object.assign(inst, { d: 0, r: false, m: 0 });
    }
    if (to === "stage") {
      if (me.stage) move(me.stage.u, "trash");
      me.stage = inst;
      inst.t = G.turn.count;
    } else if (to === "deck") {
      if (pos === "top") me.deck.unshift(inst);
      else me.deck.push(inst);
    } else if (to === "life") {
      if (pos === "top") me.life.push(inst);
      else me.life.unshift(inst);
    } else {
      if (to === "chars") inst.t = G.turn.count;
      me[to].push(inst);
    }
    return inst;
  }
  function reveal(inst, why) {
    send({ t: "reveal", c: inst.c, why });
  }
  async function playCard(u, free = false) {
    const loc = locate(u);
    if (!loc) return;
    const c = myCard(loc.inst);
    const cost = free ? 0 : Number(c.cost) || 0;
    if (cost > G.me.donActive) return toast(`Pas assez de DON!! actifs : il en faut ${cost}.`);
    if (c.type === "character" && G.me.chars.length >= 5) {
      const victim = await pickCard("Zone pleine (5 Personnages) : choisissez celui \xE0 d\xE9fausser", G.me.chars, myCard);
      if (!victim) return;
      move(victim.u, "trash");
      log(`d\xE9fausse ${name(myCard(victim))} pour faire de la place.`);
    }
    G.me.donActive -= cost;
    G.me.donRested += cost;
    const from = loc.zone === "hand" ? "" : ` depuis ${zoneName(loc.zone)}`;
    if (c.type === "character") {
      move(u, "chars");
      log(`joue ${name(c)}${from}${cost ? ` (co\xFBt ${cost})` : ""}.`);
    } else if (c.type === "stage") {
      move(u, "stage");
      log(`joue le Lieu ${name(c)}${from}${cost ? ` (co\xFBt ${cost})` : ""}.`);
    } else if (c.type === "event") {
      move(u, "trash");
      reveal(loc.inst, "\xC9v\xE9nement activ\xE9");
      log(`active l'\xC9v\xE9nement ${name(c)}${cost ? ` (co\xFBt ${cost})` : ""}.`);
    }
    commit();
  }
  var zoneName = (z) => ({
    hand: "la main",
    chars: "le terrain",
    trash: "la d\xE9fausse",
    life: "la Vie",
    deck: "le deck",
    stage: "le terrain"
  })[z] || z;
  function startAttack(inst) {
    if (G.turn.count <= 2) return toast("Personne ne peut attaquer pendant son premier tour.");
    const c = myCard(inst);
    if (c.type === "character" && inst.t === G.turn.count && !hasRush(c) && !confirm(`${c.name} a \xE9t\xE9 jou\xE9 ce tour et n'a pas [Initiative]. Attaquer quand m\xEAme ?`)) return;
    G.select = { kind: "attack", attacker: inst.u };
    render2();
  }
  function declareAttack(targetInst, isLeader) {
    const atk = locate(G.select.attacker)?.inst;
    G.select = null;
    if (!atk) return;
    const c = myCard(atk);
    atk.r = true;
    G.battle = {
      role: "atk",
      step: "attack",
      attacker: atk.u,
      attackerCard: atk.c,
      target: targetInst.u,
      targetCard: targetInst.c,
      targetIsLeader: isLeader,
      counter: 0,
      blocker: null,
      double: hasDoubleAttack(c),
      banish: hasBanish(c)
    };
    log(`attaque ${name(oppCard(targetInst))} avec ${name(c)}.`);
    commit();
  }
  function sendAttack() {
    const b = G.battle;
    const atk = locate(b.attacker)?.inst;
    if (!atk) {
      G.battle = null;
      return commit();
    }
    b.atkPower = myPower(atk);
    b.step = "defense";
    const { role, ...wire2 } = b;
    send({ t: "attack", b: wire2 });
    log(`confirme l'attaque : ${b.atkPower} de puissance${b.double ? " (Double attaque)" : ""}${b.banish ? " (Exil)" : ""}.`);
    commit();
  }
  function cancelAttack() {
    const atk = locate(G.battle.attacker)?.inst;
    if (atk) atk.r = false;
    G.battle = null;
    log("annule son attaque.");
    commit();
  }
  function battleUpd() {
    const { counter, blocker, target, targetCard, targetIsLeader } = G.battle;
    send({ t: "battleUpd", b: { counter, blocker, target, targetCard, targetIsLeader } });
    commit();
  }
  function block(inst) {
    const c = myCard(inst);
    if (!isBlocker(c) && !confirm(`${c.name} n'a pas [Bloqueur]. Bloquer quand m\xEAme ?`)) return;
    inst.r = true;
    Object.assign(G.battle, { blocker: inst.u, target: inst.u, targetCard: inst.c, targetIsLeader: false });
    log(`bloque avec ${name(c)}.`);
    battleUpd();
  }
  function counterChar(inst) {
    const c = myCard(inst);
    move(inst.u, "trash");
    G.battle.counter += Number(c.counter) || 0;
    reveal(inst, `Contre +${c.counter}`);
    log(`utilise ${name(c)} en Contre (+${c.counter}).`);
    battleUpd();
  }
  async function counterEvent(inst) {
    const c = myCard(inst);
    const cost = Number(c.cost) || 0;
    if (cost > G.me.donActive) return toast(`Pas assez de DON!! actifs : il en faut ${cost}.`);
    const bonus = await ask(
      `Contre : ${c.name}`,
      `<div class="ask-card">${cardHTML(c)}</div><p>Quel bonus de puissance donne cet \xC9v\xE9nement ? (0 si l'effet est autre)</p>`,
      [0, 1e3, 2e3, 3e3, 4e3, 5e3, 6e3].map((v) => ({ label: v ? `+${v}` : "0", value: v })).concat({ label: "Annuler", value: null, cls: "ghost" })
    );
    if (bonus === null || !G.battle) return;
    G.me.donActive -= cost;
    G.me.donRested += cost;
    move(inst.u, "trash");
    G.battle.counter += bonus;
    reveal(inst, "\xC9v\xE9nement [Contre]");
    log(`active ${name(c)} en Contre${bonus ? ` (+${bonus})` : ""}.`);
    battleUpd();
  }
  async function resolveBattle() {
    const b = G.battle;
    if (b.resolving) return;
    b.resolving = true;
    const tgt = locate(b.target)?.inst;
    const fieldZone = tgt && ["leader", "chars"].includes(locate(b.target).zone);
    if (tgt && fieldZone) {
      const def = myPower(tgt) + b.counter;
      const tc = myCard(tgt);
      if (b.atkPower >= def) {
        if (b.targetIsLeader) {
          log(`subit l'attaque sur son Leader (${b.atkPower} contre ${def}).`);
          const lost = await takeDamage(b.double ? 2 : 1, b.banish);
          if (lost) return;
        } else {
          move(tgt.u, "trash");
          log(`voit ${name(tc)} mis KO (${b.atkPower} contre ${def}).`);
        }
      } else log(`repousse l'attaque (${b.atkPower} contre ${def}).`);
    } else log("constate que l'attaque n'a plus de cible.");
    G.battle = null;
    send({ t: "battleEnd" });
    commit();
  }
  async function takeDamage(n, banish) {
    for (let k = 0; k < n; k++) {
      const me = G.me;
      if (!me.life.length) {
        lose("Son Leader a \xE9t\xE9 touch\xE9 sans carte Vie restante.");
        return true;
      }
      const inst = me.life.pop();
      const c = myCard(inst);
      if (banish) {
        me.trash.push(inst);
        log(`perd 1 Vie (Exil) : ${name(c)} va \xE0 la d\xE9fausse.`);
        reveal(inst, "Vie exil\xE9e");
        continue;
      }
      if (c.trigger) {
        commit();
        const choice = await ask("D\xE9clenchement !", `<div class="ask-card">${cardHTML(c)}</div><p>Cette carte Vie a un effet <b>D\xE9clenchement</b>.</p>`, [
          { label: "Activer le D\xE9clenchement", value: "trig", cls: "primary" },
          { label: "Ajouter \xE0 la main", value: "hand" }
        ]);
        if (choice === "trig") {
          reveal(inst, "D\xE9clenchement");
          log(`r\xE9v\xE8le ${name(c)} et active son D\xE9clenchement : ${c.trigger}`);
          const where = await ask("Apr\xE8s le D\xE9clenchement", `<p>O\xF9 va ${esc(c.name)} ?</p>`, [
            { label: "D\xE9fausse", value: "trash", cls: "primary" },
            ...c.type === "character" || c.type === "stage" ? [{ label: "Jouer sur le terrain", value: "play" }] : [],
            { label: "Main", value: "hand" }
          ]);
          if (where === "play") {
            me.hand.push(inst);
            await playCard(inst.u, true);
          } else me[where || "trash"].push(inst);
          continue;
        }
      }
      me.hand.push(inst);
      log("perd 1 Vie (ajout\xE9e \xE0 la main).");
    }
    return false;
  }
  function menuForCard(u) {
    const loc = locate(u);
    if (!loc) return [];
    const { zone, inst } = loc;
    const c = myCard(inst);
    const b = G.battle;
    const defending = b?.role === "def";
    const it = [];
    const act = (label, fn, opt = {}) => it.push({ label, fn, ...opt });
    const done = (msg2) => () => {
      if (msg2) log(msg2);
      commit();
    };
    const playable = c.type !== "leader";
    if (zone === "hand") {
      if (defending && c.type === "character" && Number(c.counter) > 0) act(`\u{1F6E1} Contre +${c.counter}`, () => counterChar(inst), { cls: "hl" });
      if (defending && c.type === "event") act("\u{1F6E1} Jouer en Contre (\xC9v\xE9nement)", () => counterEvent(inst), { cls: "hl" });
      if (myTurn() && !b) act(`\u25B6 Jouer (co\xFBt ${c.cost || 0})`, () => playCard(u), { cls: "hl" });
      act("Jouer sans payer le co\xFBt", () => playCard(u, true));
      act("D\xE9fausser", () => {
        move(u, "trash");
        done(`d\xE9fausse ${name(c)} de sa main.`)();
      });
      act("R\xE9v\xE9ler \xE0 l'adversaire", () => {
        reveal(inst, "Carte r\xE9v\xE9l\xE9e");
        log(`r\xE9v\xE8le ${name(c)}.`);
        commit();
      });
      act("Placer sur le dessus du deck", () => {
        move(u, "deck", "top");
        done("place une carte de sa main sur son deck.")();
      });
      act("Placer sous le deck", () => {
        move(u, "deck", "bottom");
        done("place une carte de sa main sous son deck.")();
      });
      act("Ajouter sur la Vie (face cach\xE9e)", () => {
        move(u, "life", "top");
        done("ajoute une carte de sa main \xE0 sa Vie.")();
      });
    } else if (zone === "leader" || zone === "chars" || zone === "stage") {
      if (zone !== "stage" && myTurn() && !b && !inst.r) act("\u2694 Attaquer", () => startAttack(inst), { cls: "hl" });
      if (defending && zone === "chars" && !inst.r && !b.blocker && b.target !== inst.u) {
        act(`\u{1F6E1} Bloquer${isBlocker(c) ? "" : " (sans [Bloqueur])"}`, () => block(inst), { cls: isBlocker(c) ? "hl" : "" });
      }
      act(inst.r ? "Redresser (actif)" : "Reposer", () => {
        inst.r = !inst.r;
        done(`${inst.r ? "repose" : "redresse"} ${name(c)}.`)();
      });
      if (zone !== "stage") {
        act(`Attacher 1 DON!! (${G.me.donActive} actif${G.me.donActive > 1 ? "s" : ""})`, () => {
          G.me.donActive--;
          inst.d = (inst.d || 0) + 1;
          done(`attache 1 DON!! \xE0 ${name(c)}.`)();
        }, { disabled: !G.me.donActive });
        if (inst.d) {
          act("D\xE9tacher 1 DON!! (\u2192 zone de co\xFBt, repos\xE9)", () => {
            inst.d--;
            G.me.donRested++;
            done(`d\xE9tache 1 DON!! de ${name(c)}.`)();
          });
          act("Renvoyer 1 DON!! attach\xE9 au deck DON!!", () => {
            inst.d--;
            G.me.donDeck++;
            done(`renvoie 1 DON!! de ${name(c)} au deck DON!!.`)();
          });
        }
        act("+1000 puissance (jusqu'\xE0 la fin du tour)", () => {
          inst.m = (inst.m || 0) + 1e3;
          done(`${name(c)} gagne +1000.`)();
        });
        act("\u22121000 puissance (jusqu'\xE0 la fin du tour)", () => {
          inst.m = (inst.m || 0) - 1e3;
          done(`${name(c)} perd 1000.`)();
        });
        if (inst.m) act("Annuler les modifs de puissance", () => {
          inst.m = 0;
          done(`${name(c)} revient \xE0 sa puissance normale.`)();
        });
      }
      if (zone !== "leader") {
        act("KO / D\xE9fausser", () => {
          move(u, "trash");
          done(`${name(c)} va \xE0 la d\xE9fausse.`)();
        }, { sep: true });
        act("Renvoyer en main", () => {
          move(u, "hand");
          done(`renvoie ${name(c)} en main.`)();
        });
        act("Placer sur le dessus du deck", () => {
          move(u, "deck", "top");
          done(`place ${name(c)} sur son deck.`)();
        });
        act("Placer sous le deck", () => {
          move(u, "deck", "bottom");
          done(`place ${name(c)} sous son deck.`)();
        });
        act("Ajouter sur la Vie", () => {
          move(u, "life", "top");
          done(`ajoute ${name(c)} \xE0 sa Vie.`)();
        });
      }
    } else {
      const src = zoneName(zone);
      const hidden = zone !== "trash";
      act("Ajouter \xE0 la main", () => {
        move(u, "hand");
        done(hidden ? `ajoute une carte de ${src} \xE0 sa main.` : `ajoute ${name(c)} de la d\xE9fausse \xE0 sa main.`)();
      }, { cls: "hl" });
      if (hidden) act("Ajouter \xE0 la main en la r\xE9v\xE9lant", () => {
        reveal(inst, `Ajout\xE9e depuis ${src}`);
        move(u, "hand");
        done(`r\xE9v\xE8le ${name(c)} et l'ajoute \xE0 sa main.`)();
      });
      if (playable) act("Jouer sans payer le co\xFBt", () => playCard(u, true));
      if (zone !== "trash") act("D\xE9fausser", () => {
        move(u, "trash");
        done(`d\xE9fausse ${name(c)} depuis ${src}.`)();
      });
      act("Placer sur le dessus du deck", () => {
        move(u, "deck", "top");
        done(`place une carte de ${src} sur son deck.`)();
      });
      act("Placer sous le deck", () => {
        move(u, "deck", "bottom");
        done(`place une carte de ${src} sous son deck.`)();
      });
      if (zone !== "life") act("Ajouter sur la Vie", () => {
        move(u, "life", "top");
        done(`ajoute une carte de ${src} \xE0 sa Vie.`)();
      });
    }
    return it;
  }
  function menuForPile(pile2) {
    const me = G.me;
    const it = [];
    const act = (label, fn, opt = {}) => it.push({ label, fn, ...opt });
    if (pile2 === "deck") {
      act("Piocher 1 carte", () => {
        if (me.deck.length) {
          me.hand.push(me.deck.shift());
          log("pioche 1 carte.");
        }
        commit();
      }, { cls: "hl" });
      act("Regarder les cartes du dessus\u2026", async () => {
        const n = await ask(
          "Regarder le dessus du deck",
          "<p>Combien de cartes ?</p>",
          [1, 2, 3, 4, 5, 6, 7].map((v) => ({ label: String(v), value: v })).concat({ label: "Annuler", value: null, cls: "ghost" })
        );
        if (!n) return;
        log(`regarde les ${n} cartes du dessus de son deck.`);
        openViewer("deck", n);
      });
      act("Chercher dans tout le deck", () => {
        log("cherche dans son deck.");
        openViewer("deck");
      });
      act("M\xE9langer le deck", () => {
        shuffle(me.deck);
        log("m\xE9lange son deck.");
        commit();
      });
      act("D\xE9fausser la carte du dessus", () => {
        const i = me.deck[0];
        if (!i) return;
        move(i.u, "trash");
        log(`d\xE9fausse ${name(myCard(i))} du dessus de son deck.`);
        commit();
      });
      act("R\xE9v\xE9ler la carte du dessus", () => {
        const i = me.deck[0];
        if (!i) return;
        reveal(i, "Dessus du deck");
        log(`r\xE9v\xE8le ${name(myCard(i))} (dessus du deck).`);
        commit();
      });
      act("Ajouter la carte du dessus \xE0 la Vie", () => {
        const i = me.deck[0];
        if (!i) return;
        move(i.u, "life", "top");
        log("ajoute la carte du dessus de son deck \xE0 sa Vie.");
        commit();
      });
    } else if (pile2 === "life") {
      act("Prendre 1 Vie en main (d\xE9g\xE2t manuel)", async () => {
        await takeDamage(1, false);
        commit();
      }, { cls: "hl" });
      act("Ajouter la Vie du dessus \xE0 la main", () => {
        const i = me.life.at(-1);
        if (!i) return;
        move(i.u, "hand");
        log("ajoute la carte du dessus de sa Vie \xE0 sa main.");
        commit();
      });
      act("D\xE9fausser la Vie du dessus", () => {
        const i = me.life.at(-1);
        if (!i) return;
        move(i.u, "trash");
        log(`d\xE9fausse ${name(myCard(i))} depuis sa Vie.`);
        commit();
      });
      act("Regarder ma Vie", () => {
        log("regarde ses cartes Vie.");
        openViewer("life");
      });
    } else if (pile2 === "trash") {
      openViewer("trash");
      return null;
    } else if (pile2 === "don") {
      act("Reposer 1 DON!!", () => {
        if (me.donActive) {
          me.donActive--;
          me.donRested++;
          log("repose 1 DON!!.");
        }
        commit();
      }, { disabled: !me.donActive });
      act("Redresser 1 DON!!", () => {
        if (me.donRested) {
          me.donRested--;
          me.donActive++;
          log("redresse 1 DON!!.");
        }
        commit();
      }, { disabled: !me.donRested });
      act("+1 DON!! depuis le deck DON!! (actif)", () => {
        if (me.donDeck) {
          me.donDeck--;
          me.donActive++;
          log("ajoute 1 DON!! actif.");
        }
        commit();
      }, { disabled: !me.donDeck });
      act("+1 DON!! depuis le deck DON!! (repos\xE9)", () => {
        if (me.donDeck) {
          me.donDeck--;
          me.donRested++;
          log("ajoute 1 DON!! repos\xE9.");
        }
        commit();
      }, { disabled: !me.donDeck });
      act("Renvoyer 1 DON!! actif au deck DON!!", () => {
        if (me.donActive) {
          me.donActive--;
          me.donDeck++;
          log("renvoie 1 DON!! au deck DON!!.");
        }
        commit();
      }, { disabled: !me.donActive });
      act("Renvoyer 1 DON!! repos\xE9 au deck DON!!", () => {
        if (me.donRested) {
          me.donRested--;
          me.donDeck++;
          log("renvoie 1 DON!! au deck DON!!.");
        }
        commit();
      }, { disabled: !me.donRested });
    }
    return it;
  }
  function showMenu(items, x, y) {
    closeMenu();
    if (!items?.length) return;
    const m = document.createElement("div");
    m.className = "menu";
    m.id = "menu";
    m.setAttribute("role", "menu");
    m.innerHTML = items.map((it, i) => `${it.sep ? "<hr>" : ""}<button role="menuitem" data-i="${i}" class="${it.cls || ""}" ${it.disabled ? "disabled" : ""}>${esc(it.label)}</button>`).join("");
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
    m.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
    m.addEventListener("click", (e) => {
      const i = e.target.closest("[data-i]")?.dataset.i;
      if (i === void 0) return;
      closeMenu();
      items[i].fn();
    });
    setTimeout(() => document.addEventListener("pointerdown", outside));
  }
  function outside(e) {
    if (!e.target.closest("#menu")) closeMenu();
  }
  function closeMenu() {
    document.getElementById("menu")?.remove();
    document.removeEventListener("pointerdown", outside);
  }
  function ask(title, html, buttons) {
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.className = "overlay";
      o.innerHTML = `<div class="dialog" role="dialog" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${html}
      <div class="row-btns">${buttons.map((b, i) => `<button class="btn ${b.cls || ""}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div></div>`;
      document.body.append(o);
      o.addEventListener("click", (e) => {
        const i = e.target.closest("[data-i]")?.dataset.i;
        if (i === void 0) return;
        o.remove();
        resolve(buttons[i].value);
      });
    });
  }
  function pickCard(title, insts, getCard) {
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.className = "overlay";
      o.innerHTML = `<div class="dialog wide"><h3>${esc(title)}</h3>
      <div class="card-grid">${insts.map((i, k) => `<button class="grid-card" data-k="${k}">${cardHTML(getCard(i))}</button>`).join("")}</div>
      <div class="row-btns"><button class="btn ghost" data-k="-1">Annuler</button></div></div>`;
      document.body.append(o);
      o.addEventListener("click", (e) => {
        const k = e.target.closest("[data-k]")?.dataset.k;
        if (k === void 0) return;
        o.remove();
        resolve(k === "-1" ? null : insts[+k]);
      });
    });
  }
  function openViewer(zone, count = null, side = "me") {
    G.viewer = { zone, count, side };
    render2();
  }
  function toast(text) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    document.body.append(t);
    setTimeout(() => t.remove(), 3200);
  }
  function slot(inst, side, zone) {
    const mine = side === "me";
    const c = mine ? myCard(inst) : oppCard(inst);
    const pw = c && (c.type === "leader" || c.type === "character") ? mine ? myPower(inst) : oppPower(inst) : void 0;
    const cls = ["slot"];
    if (inst.r) cls.push("rested");
    if (G.select?.kind === "attack" && !mine && (zone === "leader" || zone === "chars" && inst.r)) cls.push("target");
    if (G.select?.attacker === inst.u) cls.push("attacking");
    if (G.battle && G.battle.attacker === inst.u) cls.push("attacking");
    if (G.battle && G.battle.target === inst.u) cls.push("defending");
    return `<div class="${cls.join(" ")}" data-u="${inst.u}" data-side="${side}" data-zone="${zone}" data-cid="${inst.c}" tabindex="0">
    ${cardHTML(c, { power: pw })}${inst.d ? `<span class="don-badge" title="DON!! attach\xE9s">+${inst.d} DON</span>` : ""}</div>`;
  }
  function pile(kind, side, n, label, top) {
    const face = top ? cardHTML(top) : n ? cardHTML(null) : '<div class="card empty-pile"></div>';
    return `<div class="pile p-${kind}" data-pile="${kind}" data-side="${side}" ${top ? `data-cid="${top.c || ""}"` : ""} tabindex="0" role="button" aria-label="${label} (${n})">
    ${face}<span class="count">${n}</span><span class="lbl">${label}</span></div>`;
  }
  function donArea(side, d) {
    const tokens = Array.from({ length: d.donActive }, () => '<span class="don"></span>').join("") + Array.from({ length: d.donRested }, () => '<span class="don rested"></span>').join("");
    return `<div class="don-area" data-pile="don" data-side="${side}" tabindex="0" role="button">
    <div class="don-deck"><b>${d.donDeck}</b><span>Deck DON!!</span></div>
    <div class="don-cost"><div class="tokens">${tokens || '<span class="muted small">Zone de co\xFBt</span>'}</div>
    <div class="small"><b>${d.donActive}</b> actif${d.donActive > 1 ? "s" : ""} \xB7 ${d.donRested} repos\xE9${d.donRested > 1 ? "s" : ""}</div></div></div>`;
  }
  function sideHTML(side) {
    const mine = side === "me";
    const d = mine ? G.me : G.opp;
    if (!d || !d.leader) return `<div class="side ${side} empty"><p class="muted">${mine ? "" : "En attente de l'adversaire\u2026"}</p></div>`;
    const n = (x) => mine ? x.length : x;
    const chars = Array.from({ length: 5 }, (_, i) => d.chars[i] ? slot(d.chars[i], side, "chars") : '<div class="slot free"></div>').join("");
    const base = `<div class="row base">
      ${pile("life", side, n(d.life), "Vie")}
      <div class="leader-zone">${slot(d.leader, side, "leader")}</div>
      <div class="stage-zone">${d.stage ? slot(d.stage, side, "stage") : '<div class="slot free stage-free"><span>Lieu</span></div>'}</div>
      ${pile("deck", side, n(d.deck), "Deck")}
      ${pile("trash", side, d.trash.length, "D\xE9fausse", d.trash.at(-1) ? { ...mine ? myCard(d.trash.at(-1)) : oppCard(d.trash.at(-1)), c: d.trash.at(-1).c } : null)}
      ${donArea(side, d)}
    </div>`;
    const field = `<div class="row chars-row">${chars}</div>`;
    const hand = mine ? `<div class="row hand" aria-label="Votre main">${d.hand.map((i) => `<div class="hcard" data-u="${i.u}" data-side="me" data-zone="hand" data-cid="${i.c}" tabindex="0">${cardHTML(myCard(i))}</div>`).join("") || '<span class="muted">Main vide</span>'}</div>` : `<div class="row ohand"><span class="muted small">Main : ${d.hand}</span>${'<div class="card back mini"><div class="frame"></div></div>'.repeat(d.hand)}</div>`;
    return `<div class="side ${side}">${mine ? field + base + hand : hand + base + field}</div>`;
  }
  function centerHTML() {
    const t = G.turn;
    const b = G.battle;
    let inner = "";
    if (G.phase === "hello") inner = `<p>${G.oppHello ? "Tirage au sort\u2026" : "Connexion avec l'adversaire\u2026"}</p>`;
    else if (G.phase === "choose") {
      inner = G.coinWinner === G.role ? `<p><b>Vous avez gagn\xE9 le tirage au sort !</b> Voulez-vous commencer ?</p>
         <div class="row-btns"><button class="btn primary" data-do="first">Jouer en premier</button><button class="btn" data-do="second">Jouer en second</button></div>` : `<p>${esc(G.oppName)} a gagn\xE9 le tirage et choisit qui commence\u2026</p>`;
    } else if (G.phase === "mulligan") {
      inner = `<p><b>Votre main de d\xE9part.</b> ${G.first === G.role ? "Vous commencez." : `${esc(G.oppName)} commence.`} Garder ou refaire (une seule fois) ?</p>
      <div class="row-btns"><button class="btn primary" data-do="keep">Garder</button><button class="btn" data-do="mull">Mulligan</button></div>`;
    } else if (G.phase === "ready") inner = `<p>En attente de ${esc(G.oppName)}\u2026</p>`;
    else if (G.phase === "over") {
      const win = G.winner === G.role;
      inner = `<p class="result ${win ? "win" : "lose"}">${win ? "\u{1F3C6} Victoire !" : "D\xE9faite"}</p>
      <p class="muted small">${win ? `${esc(G.oppName)} a perdu` : "Vous avez perdu"}${G.overReason ? ` : ${esc(G.overReason)}` : "."}</p>
      <div class="row-btns"><button class="btn primary" data-do="rematch">Revanche</button><button class="btn ghost" data-do="quit">Quitter</button></div>`;
    } else if (b) {
      const atkSide = b.role === "atk";
      const atkInst = atkSide ? locate(b.attacker)?.inst : findOpp(b.attacker);
      const tgtInst = atkSide ? findOpp(b.target) : locate(b.target)?.inst;
      const atkC = atkSide ? G.myCards[b.attackerCard] : G.oppCards[b.attackerCard];
      const tgtC = atkSide ? G.oppCards[b.targetCard] : G.myCards[b.targetCard];
      const atkP = b.step === "attack" && atkInst ? myPower(atkInst) : b.atkPower;
      const defBase = tgtInst ? atkSide ? oppPower(tgtInst) : myPower(tgtInst) : 0;
      const def = defBase + (b.counter || 0);
      const vs = `<div class="vs"><div><small>Attaquant</small><b>${esc(atkC?.name)}</b><span class="big">${atkP ?? "?"}</span></div>
      <span class="vs-x">\u2694</span>
      <div><small>Cible${b.blocker ? " (bloqueur)" : ""}</small><b>${esc(tgtC?.name)}</b><span class="big">${def}</span>${b.counter ? `<small>dont Contre +${b.counter}</small>` : ""}</div></div>
      ${b.double || b.banish ? `<p class="small">${b.double ? '<span class="kw">Double attaque</span> ' : ""}${b.banish ? '<span class="kw">Exil</span>' : ""}</p>` : ""}`;
      if (atkSide && b.step === "attack") {
        inner = `<p class="phase-t">\xC9tape d'attaque</p>${vs}
        <p class="small muted">R\xE9solvez vos effets [Attaque] (menu de vos cartes pour la puissance), puis envoyez l'attaque.</p>
        <label class="small"><input type="checkbox" data-flag="double" ${b.double ? "checked" : ""}> Double attaque</label>
        <label class="small"><input type="checkbox" data-flag="banish" ${b.banish ? "checked" : ""}> Exil</label>
        <div class="row-btns"><button class="btn primary" data-do="send-atk">Envoyer l'attaque</button><button class="btn ghost" data-do="cancel-atk">Annuler</button></div>`;
      } else if (atkSide) {
        inner = `<p class="phase-t">Combat</p>${vs}<p class="small muted">${esc(G.oppName)} choisit son Bloqueur et ses Contres\u2026</p>`;
      } else {
        inner = `<p class="phase-t">Vous \xEAtes attaqu\xE9 !</p>${vs}
        <p class="small muted">Cliquez sur un Personnage <span class="kw">Bloqueur</span> pour bloquer, et sur des cartes de votre main pour Contrer.</p>
        <div class="row-btns"><button class="btn small" data-do="ctr-plus">+1000</button><button class="btn small" data-do="ctr-minus">\u22121000</button></div>
        <div class="row-btns"><button class="btn primary" data-do="resolve">Valider la d\xE9fense</button></div>`;
      }
    } else if (G.phase === "play") {
      const mt = myTurn();
      inner = `<p class="turn ${mt ? "mine" : ""}">Tour ${t.count} \xB7 ${mt ? "\xC0 vous de jouer" : `Tour de ${esc(G.oppName)}`}</p>
      ${G.select?.kind === "attack" ? '<p class="small hl-t">Choisissez la cible : le Leader adverse ou un Personnage adverse <b>repos\xE9</b>. (\xC9chap pour annuler)</p>' : ""}
      ${mt ? '<div class="row-btns"><button class="btn primary" data-do="end">Fin du tour</button></div>' : ""}`;
    }
    return `<div class="center">${G.disconnected ? '<p class="msg err">Adversaire d\xE9connect\xE9.</p>' : ""}${inner}
    ${G.phase === "play" ? '<button class="btn ghost small concede" data-do="concede">Abandonner</button>' : ""}</div>`;
  }
  function findOpp(u) {
    const o = G.opp;
    if (!o) return null;
    if (o.leader?.u === u) return o.leader;
    if (o.stage?.u === u) return o.stage;
    return o.chars.find((x) => x.u === u) || null;
  }
  function viewerHTML() {
    const v = G.viewer;
    if (!v) return "";
    const mine = v.side === "me";
    let list = mine ? G.me[v.zone] : G.opp?.[v.zone] || [];
    if (v.zone === "deck" && v.count) list = list.slice(0, v.count);
    if (v.zone === "life" || v.zone === "trash") list = [...list].reverse();
    const title = { deck: v.count ? `Les ${v.count} cartes du dessus du deck` : "Votre deck", trash: mine ? "Votre d\xE9fausse" : `D\xE9fausse de ${esc(G.oppName)}`, life: "Votre Vie (dessus en premier)" }[v.zone];
    return `<div class="overlay viewer"><div class="dialog wide" role="dialog" aria-label="${title}">
    <h3>${title} <span class="muted">(${list.length})</span></h3>
    ${mine ? '<p class="small muted">Cliquez sur une carte pour la d\xE9placer. Ordre : la premi\xE8re carte est celle du dessus.</p>' : ""}
    <div class="card-grid">${list.map((i) => `<button class="grid-card" ${mine ? `data-vu="${i.u}"` : ""} data-cid="${i.c}" data-side="${v.side}">${cardHTML(mine ? myCard(i) : oppCard(i))}</button>`).join("") || '<p class="muted">Aucune carte.</p>'}</div>
    <div class="row-btns">${mine && v.zone === "deck" ? '<button class="btn" data-do="v-shuffle">M\xE9langer et fermer</button>' : ""}<button class="btn primary" data-do="v-close">Fermer</button></div>
  </div></div>`;
  }
  function previewHTML() {
    const p = G.preview;
    if (!p) return '<p class="muted small">Survolez une carte pour la voir en grand.</p>';
    const c = p.side === "opp" ? G.oppCards[p.cid] : G.myCards[p.cid];
    if (!c) return "";
    let extra = "";
    const inst = p.u && (p.side === "me" ? locate(p.u)?.inst : findOpp(p.u));
    if (inst && (c.type === "leader" || c.type === "character")) {
      const ownerTurn = p.side === "me" ? myTurn() : oppTurn();
      const parts = [`base ${c.power}`];
      if (inst.d) parts.push(`${inst.d} DON!!${ownerTurn ? ` +${inst.d * 1e3}` : " (inactif hors de son tour)"}`);
      if (inst.m) parts.push(`effets ${inst.m > 0 ? "+" : ""}${inst.m}`);
      extra = `<p class="small">Puissance : <b>${power(inst, c, ownerTurn)}</b> (${parts.join(", ")})</p>`;
    }
    return `<div class="big-card">${cardHTML(c)}</div>${extra}
    <div class="pv-text"><b>${esc(c.name)}</b> <span class="muted">${TYPES[c.type]}</span>
    ${c.effect ? `<p>${fmtEffect(c.effect)}</p>` : ""}${c.trigger ? `<p><span class="kw trig">D\xE9clenchement</span> ${fmtEffect(c.trigger)}</p>` : ""}</div>`;
  }
  function logHTML() {
    return G.log.slice(-200).map((l) => {
      const who = l.who === "me" ? G.name : l.who === "opp" ? G.oppName : "";
      return `<li class="lg-${l.who}${l.chat ? " chat" : ""}">${who ? `<b>${esc(who)}</b> ` : ""}${l.chat ? "\u{1F4AC} " : ""}${esc(l.text)}</li>`;
    }).join("");
  }
  function revealsHTML() {
    return G.reveals.map((r) => `<div class="reveal" data-rid="${r.id}"><small>${esc(G.oppName)} \xB7 ${esc(r.why || "r\xE9v\xE8le")}</small>${cardHTML(G.oppCards[r.c])}<button class="btn small" data-do="r-close" data-rid="${r.id}">OK</button></div>`).join("");
  }
  function render2() {
    if (!G) {
      renderLobby();
      return;
    }
    const r = root3();
    if (!r.querySelector(".game")) {
      r.innerHTML = `<div class="game">
      <div class="board" id="gm-board"></div>
      <aside class="gside">
        <div class="panel preview" id="gm-preview"></div>
        <div class="panel logp"><h3>Journal</h3><ul id="gm-log" class="log"></ul>
          <form id="gm-chat" class="row-btns"><input placeholder="Message\u2026" maxlength="200" aria-label="Message"><button class="btn small">Envoyer</button></form></div>
      </aside>
      <div id="gm-viewer"></div><div id="gm-reveals" class="reveals"></div>
    </div>`;
      bindBoard(r);
    }
    r.querySelector("#gm-board").innerHTML = `
    <div class="names"><span>${esc(G.oppName)}</span></div>
    ${sideHTML("opp")}${centerHTML()}${sideHTML("me")}
    <div class="names"><span>${esc(G.name)} (vous)</span></div>`;
    r.querySelector("#gm-preview").innerHTML = previewHTML();
    const lg = r.querySelector("#gm-log");
    const atBottom = lg.scrollHeight - lg.scrollTop - lg.clientHeight < 40;
    lg.innerHTML = logHTML();
    if (atBottom) lg.scrollTop = lg.scrollHeight;
    r.querySelector("#gm-viewer").innerHTML = viewerHTML();
    r.querySelector("#gm-reveals").innerHTML = revealsHTML();
  }
  function bindBoard(r) {
    r.addEventListener("click", onBoardClick);
    r.addEventListener("change", (e) => {
      const f = e.target.dataset.flag;
      if (f && G.battle) {
        G.battle[f] = e.target.checked;
        render2();
      }
    });
    r.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-u],[data-pile]")) {
        e.preventDefault();
        onBoardClick(e);
      }
    });
    r.addEventListener("mouseover", (e) => {
      const el = e.target.closest("[data-cid]");
      if (!el || !el.dataset.cid) return;
      const p = { cid: el.dataset.cid, side: el.dataset.side || "me", u: el.dataset.u };
      if (G.preview?.cid === p.cid && G.preview?.u === p.u) return;
      G.preview = p;
      r.querySelector("#gm-preview").innerHTML = previewHTML();
    });
    r.addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = e.target.querySelector("input");
      const text = inp.value.trim();
      if (!text) return;
      G.log.push({ who: "me", text, chat: true });
      send({ t: "chat", text });
      inp.value = "";
      render2();
    });
  }
  async function onBoardClick(e) {
    const doEl = e.target.closest("[data-do]");
    if (doEl) return doAction(doEl.dataset.do, doEl);
    const vu = e.target.closest("[data-vu]");
    if (vu) {
      const rect = vu.getBoundingClientRect();
      return showMenu(menuForCard(vu.dataset.vu), rect.left + 10, rect.top + 20);
    }
    if (G.phase !== "play" && G.phase !== "mulligan") return;
    const el = e.target.closest("[data-u],[data-pile]");
    if (!el) return;
    const { side } = el.dataset;
    const x = e.clientX || el.getBoundingClientRect().left;
    const y = e.clientY || el.getBoundingClientRect().top;
    if (G.phase === "mulligan") return;
    if (G.select?.kind === "attack") {
      if (side === "opp" && el.dataset.u) {
        const inst = findOpp(el.dataset.u);
        const isLeader = G.opp.leader.u === inst?.u;
        if (inst && (isLeader || el.dataset.zone === "chars" && inst.r)) return declareAttack(inst, isLeader);
        return toast("Cible invalide : un Personnage doit \xEAtre repos\xE9 pour \xEAtre attaqu\xE9.");
      }
      G.select = null;
      render2();
      return;
    }
    if (side === "opp") {
      if (el.dataset.pile === "trash") openViewer("trash", null, "opp");
      return;
    }
    if (el.dataset.pile) {
      const items = menuForPile(el.dataset.pile);
      if (items) showMenu(items, x, y);
      return;
    }
    showMenu(menuForCard(el.dataset.u), x, y);
  }
  function doAction(a, el) {
    switch (a) {
      case "first":
        return chooseFirst(true);
      case "second":
        return chooseFirst(false);
      case "keep":
        return finishMulligan(false);
      case "mull":
        return finishMulligan(true);
      case "end":
        return endTurn();
      case "send-atk":
        return sendAttack();
      case "cancel-atk":
        return cancelAttack();
      case "resolve":
        return resolveBattle();
      case "ctr-plus":
        G.battle.counter += 1e3;
        log("ajoute +1000 en d\xE9fense (effet).");
        return battleUpd();
      case "ctr-minus":
        G.battle.counter -= 1e3;
        log("retire 1000 en d\xE9fense (effet).");
        return battleUpd();
      case "concede":
        if (confirm("Abandonner la partie ?")) lose("Abandon.");
        return void 0;
      case "rematch":
        send({ t: "rematch" });
        return resetMatch();
      case "quit":
        link?.close();
        link = null;
        G = null;
        Object.assign(lobby, { status: "idle", code: "", error: "" });
        return renderLobby();
      case "v-shuffle":
        shuffle(G.me.deck);
        log("m\xE9lange son deck.");
        G.viewer = null;
        return commit();
      case "v-close":
        G.viewer = null;
        return render2();
      case "r-close":
        G.reveals = G.reveals.filter((r) => r.id !== el.dataset.rid);
        return render2();
      default:
        return void 0;
    }
  }

  // js/app.js
  var tabs = document.querySelectorAll("[data-tab]");
  function show(name2) {
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name2)));
    document.querySelectorAll(".tab").forEach((p) => {
      p.hidden = p.id !== `tab-${name2}`;
    });
    try {
      localStorage.setItem("optcgm-tab", name2);
    } catch {
    }
  }
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
  load().then(() => {
    initEditor();
    initDecks();
    initPlay();
    let start = "cards";
    try {
      start = localStorage.getItem("optcgm-tab") || "cards";
    } catch {
    }
    if (new URLSearchParams(location.search).get("join")) start = "play";
    show(start);
  });
})();
