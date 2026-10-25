// Annonce plein écran d'un mot-clé en partie (BLOCKER, DOUBLE ATTACK, BANISH), façon Dokkan :
// deux bandes d'éclairs relient les bords de l'écran et le mot s'écrase entre elles.
// Dessinée en direct sur un canvas, avec son ; jouée chez les deux joueurs.

const DUR = 2.0;
const sound = new Audio('sons/kwfx.mp3');
sound.preload = 'auto';

function rng(s) {
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const outBack = (x) => { const k = 1.9; x = clamp(x) - 1; return 1 + (k + 1) * x * x * x + k * x * x; };
const outCubic = (x) => 1 - (1 - clamp(x)) ** 3;
const FONT = '"Archivo Black", "Arial Black", Impact, sans-serif';

function bolt(r, x0, x1, y, amp, step) {
  const pts = [[x0, y]];
  let x = x0;
  while (x < x1) { x += step * (0.5 + r()); pts.push([Math.min(x, x1), y + (r() - 0.5) * amp]); }
  return pts;
}
function strokePts(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }

function band(g, W, k, y, dir, t, frame) {
  const p = outCubic((t - 0.05) / 0.25);
  if (p <= 0) return;
  const x0 = dir > 0 ? 0 : W * (1 - p), x1 = dir > 0 ? W * p : W;
  const h = 70 * k;
  g.save();
  g.globalAlpha = 1 - clamp((t - 1.72) / 0.25);
  g.globalCompositeOperation = 'lighter';
  const gr = g.createLinearGradient(0, y - h, 0, y + h);
  gr.addColorStop(0, 'rgba(120,255,40,0)'); gr.addColorStop(0.35, 'rgba(160,255,60,.28)'); gr.addColorStop(0.5, 'rgba(255,255,170,.55)');
  gr.addColorStop(0.65, 'rgba(160,255,60,.28)'); gr.addColorStop(1, 'rgba(120,255,40,0)');
  g.fillStyle = gr; g.fillRect(x0, y - h, x1 - x0, 2 * h);
  // éclairs renouvelés toutes les 2 images ; le halo est fait de traits larges et transparents (pas de flou, trop lent)
  const r = rng(Math.floor(frame / 2) * 97 + (dir > 0 ? 1 : 2));
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (let n = 0; n < 4; n++) {
    const pts = bolt(r, x0 - 20, x1 + 20, y + (r() - 0.5) * 30 * k, (60 + n * 20) * k, 60 * Math.max(k, 0.5));
    const br = [];
    for (let b = 0; b < 3; b++) {
      const [bx, by] = pts[1 + (r() * (pts.length - 2) | 0)] || pts[0];
      br.push(bolt(r, bx, bx + (80 + r() * 120) * k, by, 40 * k, 50 * k).map(([x, yy], i) => [x, yy + i * (r() < 0.5 ? -9 : 9) * k]));
    }
    const w = n ? 1 : 1.6;
    g.strokeStyle = 'rgba(150,255,50,.13)'; g.lineWidth = 26 * k * w; strokePts(g, pts);
    g.strokeStyle = 'rgba(180,255,70,.35)'; g.lineWidth = 10 * k * w; strokePts(g, pts);
    g.strokeStyle = 'rgba(255,255,230,.95)'; g.lineWidth = Math.max(1, 2.5 * k * w); strokePts(g, pts);
    g.lineWidth = Math.max(1, 1.5 * k); br.forEach((x) => strokePts(g, x));
  }
  g.fillStyle = 'rgba(255,255,200,.9)';
  for (let i = 0; i < 26; i++) {
    const s = (2 + r() * 4) * k;
    g.fillRect(x0 + r() * (x1 - x0), y + (r() - 0.5) * 120 * k, s, s);
  }
  if (p < 1) { // tête lumineuse de l'éclair qui traverse l'écran
    const hx = dir > 0 ? x1 : x0, rad = 160 * k;
    const rg = g.createRadialGradient(hx, y, 0, hx, y, rad);
    rg.addColorStop(0, 'rgba(255,255,220,.95)'); rg.addColorStop(1, 'rgba(160,255,60,0)');
    g.fillStyle = rg; g.fillRect(hx - rad, y - rad, 2 * rad, 2 * rad);
  }
  g.restore();
}

const offscreen = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };

// Le mot-clé est dessiné une seule fois (contours, dégradés, ombre), puis seulement agrandi à chaque image.
function textLayers(lines, fs, dpr) {
  const m = offscreen(1, 1).getContext('2d');
  m.font = `${fs}px ${FONT}`;
  const lh = fs * 1.05, tw = Math.max(...lines.map((l) => m.measureText(l).width));
  const pad = fs * 0.5, w = tw + fs * 0.4 + 2 * pad, h = lines.length * lh + 2 * pad;
  const make = (draw) => {
    const c = offscreen(w * dpr, h * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr); g.translate(w / 2, h / 2); g.transform(1, 0, -0.18, 1, 0, 0);
    g.font = `${fs}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const y0 = -(lines.length - 1) * lh / 2;
    draw(g, (fn) => lines.forEach((l, i) => fn(l, y0 + i * lh)));
    return c;
  };
  const u = fs / 250;
  const main = make((g, each) => {
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 30 * u; g.shadowOffsetY = 10 * u;
    g.strokeStyle = '#0a0d26'; g.lineWidth = 44 * u; each((l, y) => g.strokeText(l, 0, y));
    g.shadowColor = 'transparent';
    each((l, y) => {
      const og = g.createLinearGradient(0, y - fs * 0.45, 0, y + fs * 0.45);
      og.addColorStop(0, '#fff36a'); og.addColorStop(0.5, '#ff9c1a'); og.addColorStop(1, '#e8360c');
      g.strokeStyle = og; g.lineWidth = 22 * u; g.strokeText(l, 0, y);
    });
    g.strokeStyle = '#0a0d26'; g.lineWidth = 7 * u; each((l, y) => g.strokeText(l, 0, y));
    each((l, y) => {
      const fg = g.createLinearGradient(0, y - fs * 0.4, 0, y + fs * 0.4);
      fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.55, '#fffbe0'); fg.addColorStop(1, '#ffe27a');
      g.fillStyle = fg; g.fillText(l, 0, y);
    });
  });
  const white = make((g, each) => { g.fillStyle = '#fff'; each((l, y) => g.fillText(l, 0, y)); });
  return { main, white, shine: offscreen(main.width, main.height), w, h };
}

function words(g, W, H, L, fs, t) {
  const a = (t - 0.22) / 0.16;
  if (a <= 0) return;
  const s = 2.8 - 1.8 * outBack(a);
  const shake = t > 0.36 && t < 0.56 ? (1 - (t - 0.36) / 0.2) * 14 * (fs / 200) : 0;
  const r = rng((t * 30 | 0) + 5);
  g.save();
  g.globalAlpha = clamp(a * 2) * (1 - clamp((t - 1.72) / 0.25));
  g.translate(W / 2 + (r() - 0.5) * shake, H / 2 + (r() - 0.5) * shake);
  g.scale(s, s);
  let layer = L.main;
  const sh = (t - 0.75) / 0.35; // reflet qui traverse le texte
  if (sh > 0 && sh < 1) {
    const c = L.shine.getContext('2d'), cw = L.shine.width;
    c.globalCompositeOperation = 'copy'; c.drawImage(L.main, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    const sx = -cw * 0.2 + sh * cw * 1.4, bw = cw * 0.12;
    const lg = c.createLinearGradient(sx - bw, 0, sx + bw, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = lg; c.fillRect(0, 0, cw, L.shine.height);
    layer = L.shine;
  }
  g.drawImage(layer, -L.w / 2, -L.h / 2, L.w, L.h);
  if (a < 1.6) { // éclat blanc à l'impact
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = (1 - clamp((a - 0.6) / 1.0)) * 0.9;
    g.drawImage(L.white, -L.w / 2, -L.h / 2, L.w, L.h);
  }
  g.restore();
}

// Personnage détouré (image du mot-clé), préparé une fois avec son contour lumineux,
// puis il arrive de la droite, ancré en bas.
function figureLayer(img, W, H, dpr) {
  const ih = Math.min(H * 0.78, W * 1.1 * img.height / img.width), iw = ih * img.width / img.height;
  const pad = Math.max(12, W / 60) * 2;
  const c = offscreen((iw + 2 * pad) * dpr, (ih + 2 * pad) * dpr), g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.shadowColor = 'rgba(170,255,60,.95)'; g.shadowBlur = pad / 2;
  g.drawImage(img, pad, pad, iw, ih);
  g.shadowBlur = 0; g.drawImage(img, pad, pad, iw, ih);
  return { c, iw, ih, pad };
}
function figure(g, W, H, F, t) {
  const a = outCubic((t - 0.12) / 0.3);
  if (a <= 0) return;
  const z = 1 + 0.04 * t, iw = F.iw * z, ih = F.ih * z, pad = F.pad * z;
  const x = W - iw * 0.98 + (1 - a) * iw * 0.8, y = H - ih;
  g.save();
  g.globalAlpha = clamp(a * 1.5) * (1 - clamp((t - 1.72) / 0.25));
  g.drawImage(F.c, x - pad, y - pad, iw + 2 * pad, ih + 2 * pad);
  g.restore();
}

function frameAt(g, W, H, layout, t, fig) {
  const frame = Math.round(t * 30);
  const end = 1 - clamp((t - 1.78) / 0.22);
  g.clearRect(0, 0, W, H);
  g.fillStyle = `rgba(0,0,0,${0.6 * clamp(t / 0.3) * end})`; g.fillRect(0, 0, W, H);
  const r = rng(frame * 13 + 3); // lignes de vitesse
  g.save(); g.globalAlpha = 0.25 * clamp(t / 0.2) * end; g.strokeStyle = '#fff';
  for (let i = 0; i < 40; i++) {
    const y = r() * H, x = r() * W, l = (200 + r() * 500) * layout.k;
    g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke();
  }
  g.restore();
  band(g, W, layout.k, H / 2 - layout.gap, 1, t, frame);
  band(g, W, layout.k, H / 2 + layout.gap, -1, t, frame);
  if (fig) figure(g, W, H, fig, t);
  words(g, W, H, layout.text, layout.fs, t);
  const fl = 1 - clamp(t / 0.18); // flash d'ouverture
  if (fl > 0) { g.fillStyle = `rgba(255,255,255,${fl * 0.85})`; g.fillRect(0, 0, W, H); }
}

// Taille du texte : il tient dans la largeur ; sur un écran étroit, un mot-clé en deux mots passe sur deux lignes.
function layoutFor(g, W, H, text) {
  const fit = (lines) => {
    g.font = `250px ${FONT}`;
    const w = Math.max(...lines.map((l) => g.measureText(l).width)) * 1.08;
    return Math.min(250 * 0.86 * W / w, H * 0.17, 210);
  };
  let lines = [text], fs = fit(lines);
  if (text.includes(' ') && W < H) { const two = text.split(' '); const f2 = fit(two); if (f2 > fs * 1.3) { lines = two; fs = f2; } }
  const k = Math.max(0.45, Math.min(1.1, fs / 200));
  return { lines, fs, k, gap: (lines.length * fs * 1.05) / 2 + fs * 0.3 + 30 * k };
}

const images = {};
function loadImage(src) {
  if (!src) return Promise.resolve(null);
  images[src] ||= new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  return images[src];
}

function play(text, imgSrc) {
  return loadImage(imgSrc).then((img) => new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'kwfx-ov';
    const cv = document.createElement('canvas');
    ov.append(cv);
    document.body.append(ov);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const layout = layoutFor(g, W, H, text);
    layout.text = textLayers(layout.lines, layout.fs, dpr);
    const fig = img && figureLayer(img, W, H, dpr);
    try { sound.currentTime = 0; sound.volume = 0.9; sound.play().catch(() => {}); } catch { /* pas de son */ }
    const t0 = performance.now();
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      sound.pause();
      ov.remove();
      resolve();
    };
    ov.addEventListener('click', end);
    const tick = () => {
      if (done) return;
      const t = (performance.now() - t0) / 1000;
      if (t >= DUR) { end(); return; }
      frameAt(g, W, H, layout, t, fig);
      requestAnimationFrame(tick);
    };
    tick();
  }));
}

// Les annonces passent l'une après l'autre, et après la vidéo d'animation en cours s'il y en a une.
let chain = Promise.resolve();
const videoGone = () => new Promise((ok) => {
  const check = () => (document.querySelector('.anim-ov') ? setTimeout(check, 100) : ok());
  check();
});
export function keywordFx(text, imgSrc) {
  chain = chain.then(videoGone).then(() => document.fonts.load(`80px ${FONT}`).catch(() => {})).then(() => play(text, imgSrc));
  return chain;
}
