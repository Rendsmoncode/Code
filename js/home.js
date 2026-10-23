// Onglet Accueil : grand logo, boosters disponibles et raccourcis.
// Sur ordinateur : logo, boutons et chiffres clés. Sur téléphone : logo, booster au centre et bouton Ouvrir.
import { S, onChange } from './store.js';
import { logoSVG } from './logo.js';
import { boosterState, mmss, openFromHome, packHTML } from './boosters.js';
import { icon } from './icons.js';

export function initHome(go) {
  const el = document.getElementById('tab-home');
  el.innerHTML = `
  <div class="home">
    <div class="hm-logo">${logoSVG()}</div>
    <p class="hm-tag">Le jeu de cartes entre amis</p>
    <div class="hm-pack">${packHTML()}</div>
    <div class="hm-count"></div>
    <p class="hm-next"></p>
    <div class="hm-acts">
      <button class="btn main hm-open">${icon('pack')}<span class="pc-only"></span><span class="tel-only">Ouvrir</span></button>
      <button class="btn ghost hm-play">${icon('play')}Jouer</button>
    </div>
    <div class="hm-stats">
      <button class="hm-stat" data-go="collection"><span>Collection</span><b class="hm-coll"></b><div class="bar"><i></i></div></button>
      <button class="hm-stat" data-go="decks"><span>Decks</span><b class="hm-decks"></b></button>
      <button class="hm-stat" data-go="boosters"><span>Boosters</span><b class="hm-boost"></b></button>
    </div>
  </div>`;
  const q = (s) => el.querySelector(s);

  q('.hm-open').addEventListener('click', () => { go('boosters'); openFromHome(); });
  q('.hm-play').addEventListener('click', () => go('play'));
  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));

  function render() {
    const b = boosterState();
    if (b) {
      q('.hm-count').textContent = `${b.total} booster${b.total > 1 ? 's' : ''}`;
      q('.hm-next').textContent = b.next ? `Prochain booster gratuit dans ${mmss(b.left)}` : 'Réserve de boosters gratuits pleine';
      q('.hm-open .pc-only').textContent = b.total ? `Ouvrir un booster · ${b.total}` : 'Aucun booster';
      q('.hm-open').disabled = !b.total;
      q('.hm-boost').textContent = b.total;
    }
    const cards = S.cards.filter((c) => c.rarity !== 'S' || S.oneOfOne[c.id]); // 1on1 secrètes
    const owned = cards.filter((c) => S.collection[c.id]).length;
    q('.hm-coll').textContent = `${owned} / ${cards.length}`;
    q('.hm-stats .bar i').style.width = `${cards.length ? (100 * owned) / cards.length : 0}%`;
    q('.hm-decks').textContent = S.decks.length;
  }
  onChange(render);
  setInterval(() => { if (!el.hidden) render(); }, 1000);
  render();
}
