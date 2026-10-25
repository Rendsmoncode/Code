// Présentation du gameplay en quelques écrans (Paramètres → Présentation du gameplay).
import { S } from './store.js';
import { esc, cardHTML } from './cards.js';
import { playKeyword } from './kwfx.js';

const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

function myLeader() {
  const d = S.decks?.[0];
  return d ? S.byId[d.leader] : null;
}
function slides() {
  const leader = myLeader();
  const kwBtn = (k, t) => `<button class="btn small sp-kw" data-kw="${k}">${t}</button>`;
  return [
    { t: 'Le but du jeu', h: '<p>Fais tomber les <b>Vies</b> du Leader adverse à zéro… puis touche-le <b>une dernière fois</b>. C\'est gagné.</p><p class="muted">Chaque joueur commence avec 5 cartes en main.</p>' },
    { t: 'Ton Leader', h: `${leader ? `<div class="sp-card">${cardHTML(leader)}</div>` : ''}<p>Il reste toujours en jeu. Ses <b>Vies</b> sont des cartes face cachée : à chaque coup reçu, une Vie part dans ta main.</p>` },
    { t: 'Les DON!!', h: '<p>Ta ressource : <b>1 DON!!</b> au premier tour, puis <b>2 par tour</b> (10 au total).</p><p>Ils paient le <b>coût</b> de tes cartes… ou s\'attachent à un Personnage ou à ton Leader : <b>+1000 de puissance</b> chacun pendant ton tour.</p>' },
    { t: 'Ton tour', h: '<ol class="sp-list"><li>Tu pioches 1 carte</li><li>Tu reçois tes DON!!</li><li>Tu joues des <b>Personnages</b>, <b>Événements</b> et <b>Lieux</b></li><li>Tu <b>attaques</b></li><li>Fin du tour</li></ol>' },
    { t: 'Attaquer', h: '<p>L\'attaquant s\'<b>épuise</b> (il se couche). Il vise le <b>Leader adverse</b> ou un <b>Personnage épuisé</b>.</p><p>Puissance <b>égale ou supérieure</b> : ça touche. Un Personnage touché est mis KO ; un Leader touché perd une Vie.</p><p class="muted">Un Personnage joué ce tour-ci doit attendre le suivant… sauf s\'il a [Initiative].</p>' },
    { t: 'Se défendre', h: '<p><b>[Bloqueur]</b> : un de tes Personnages prend le coup à la place.</p><p><b>Contre</b> : défausse des cartes de ta main pour ajouter leur valeur de Contre (+1000, +2000…).</p><p><b>Déclenchement</b> : quand tu perds une Vie, elle peut s\'activer gratuitement.</p>' },
    { t: 'Les mots-clés', h: `<p>Certains moments ont droit à leur annonce. Touche pour voir :</p><div class="row-btns sp-kws">${kwBtn('blocker', 'Bloqueur')}${kwBtn('double', 'Double attaque')}${kwBtn('banish', 'Exil')}${kwBtn('rush', 'Initiative')}</div><p class="muted">Double attaque : 2 Vies d'un coup · Exil : la Vie part à la défausse, sans Déclenchement.</p>` },
    { t: 'Jouer', h: `<p>Ton deck est dans l'onglet <b>Decks</b>. Pour jouer : onglet <b>Jouer</b>, crée une partie et envoie le code à ton adversaire.</p><p class="sp-big">À toi de jouer${S.status?.username ? `, ${esc(cap(S.status.username))}` : ''} !</p>` },
  ];
}
export function tutorial() {
  const list = slides();
  let i = 0;
  return new Promise((resolve) => {
    const o = document.createElement('div');
    o.className = 'overlay sp-tuto';
    document.body.append(o);
    const render = () => {
      const s = list[i];
      o.innerHTML = `<div class="dialog sp-slide" role="dialog" aria-label="${esc(s.t)}">
        <div class="sp-dots">${list.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
        <h3>${esc(s.t)}</h3><div class="sp-body">${s.h}</div>
        <div class="row-btns">${i ? '<button class="btn ghost" data-go="-1">Retour</button>' : ''}
          <button class="btn main" data-go="1">${i === list.length - 1 ? 'Terminer' : 'Suivant'}</button></div></div>`;
    };
    render();
    o.addEventListener('click', (e) => {
      const kw = e.target.closest('[data-kw]')?.dataset.kw;
      if (kw) { playKeyword(kw, S.music); return; }
      const go = e.target.closest('[data-go]')?.dataset.go;
      if (!go) return;
      i += Number(go);
      if (i >= list.length) { o.remove(); resolve(); return; }
      render();
    });
  });
}
