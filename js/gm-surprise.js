// Game Master → Surprise : invitations surprise, lancement du grand moment, et compte de test.
import {
  S, saveCards, saveDeck, inviteLink, listPlayers, createSurprise, prepareSurprise, surpriseList, surpriseGo, resetTest,
} from './store.js';
import { esc, newCard } from './cards.js';

const TEST = { user: 'test', deck: 'test-deck', card: 'test-card', leader: 'test-leader' };
const STATE = { invite: 'lien pas encore ouvert', wait: 'écran noir (en attente)', go: 'surprise lancée', done: 'terminée' };

export function mountSurprise(el) {
  el.innerHTML = `
    <h3>Surprise</h3>
    <p class="muted small">Le joueur ouvre son lien et tombe sur un écran noir. Quand tu lances la surprise, son booster géant (à son prénom)
      arrive avec son deck dedans, puis l'interface apparaît, il ouvre ses boosters et découvre le gameplay.</p>
    <div class="sp-list-gm"></div>
    <div class="row-btns"><button class="btn main" data-sp="go">Lancer la surprise pour tous</button>
      <button class="btn ghost" data-sp="refresh">Actualiser</button></div>
    <h3>Nouvelle invitation surprise</h3>
    <div class="row-btns">
      <input class="sp-u" placeholder="pseudo (ex. mathieu)" maxlength="20" aria-label="Pseudo">
      <select class="sp-st" aria-label="Deck préconstruit"></select>
      <label>Boosters <input class="sp-nb" type="number" min="0" max="100" value="10"></label>
      <button class="btn" data-sp="invite">Créer le lien</button>
      <button class="btn ghost" data-sp="prepare" title="Pour un joueur qui a déjà un compte">Joueur déjà inscrit</button>
    </div>
    <p class="sp-link"></p>
    <h3>Compte de test</h3>
    <p class="muted small">Pseudo « test », deck de 50 cartes « Test » et 10 boosters. Ouvre le lien dans une fenêtre de navigation privée,
      puis lance la surprise ici. « Rejouer » remet le compte test à zéro et le renvoie sur l'écran noir.</p>
    <div class="row-btns"><button class="btn" data-sp="test">Préparer le compte test</button>
      <button class="btn ghost" data-sp="retest">Rejouer la surprise du compte test</button></div>
    <p class="msg sp-msg" role="status"></p>`;
  const q = (s) => el.querySelector(s);
  const msg = (t, err = false) => { q('.sp-msg').textContent = t; q('.sp-msg').classList.toggle('err', err); };
  const showLink = (tok, who) => {
    const url = inviteLink(tok);
    q('.sp-link').innerHTML = `Lien pour <b>${esc(who)}</b> : <input readonly value="${esc(url)}" aria-label="Lien"> <button class="btn small" data-sp="copy">Copier</button>`;
  };

  async function refresh() {
    q('.sp-st').innerHTML = S.starters.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('') || '<option value="">Aucun deck préconstruit</option>';
    const list = await surpriseList().catch(() => null);
    if (!list) { q('.sp-list-gm').innerHTML = '<p class="msg err">Relance le script supabase/setup.sql dans Supabase pour activer la surprise.</p>'; return; }
    q('.sp-list-gm').innerHTML = list.length ? `<table class="tbl"><tbody>${list.map((r) => `<tr><td><b>${esc(r.username)}</b></td><td>${STATE[r.state] || r.state}</td>
      <td>${r.state === 'wait' ? `<button class="btn small" data-go="${esc(r.username)}">Lancer</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">Aucune surprise en cours.</p>';
  }

  // Cartes, deck et invitation du compte test (créés seulement s'ils n'existent pas).
  async function prepareTest() {
    const cards = [];
    if (!S.byId[TEST.leader]) {
      cards.push({ ...newCard(), id: TEST.leader, name: 'Test', type: 'leader', colors: ['jaune', 'violet'], life: 5, power: 5000, counter: 0,
        traits: 'Test', inBoosters: false });
    }
    if (!S.byId[TEST.card]) {
      cards.push({ ...newCard(), id: TEST.card, name: 'Test', type: 'character', colors: ['jaune'], cost: 1, power: 1000, counter: 1000,
        traits: 'Test', keywords: ['unlimited'], inBoosters: false });
    }
    if (cards.length) await saveCards(cards);
    if (!S.starters.some((d) => d.id === TEST.deck)) {
      await saveDeck({ id: TEST.deck, name: 'Test', leader: TEST.leader, cards: { [TEST.card]: 50 } }, 'starter_decks');
    }
    const players = await listPlayers();
    if (players.some((p) => p.username === TEST.user)) {
      await resetTest(TEST.user, TEST.deck, 10);
      msg('Le compte test existe déjà : il a été remis à zéro et attend devant l\'écran noir (connecte-toi avec lui).');
      return;
    }
    const tok = await createSurprise(TEST.user, TEST.deck, 10);
    showLink(tok, TEST.user);
    msg('Compte test prêt : ouvre le lien dans une fenêtre privée.');
  }

  el.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-go]')?.dataset.go;
    const act = e.target.closest('[data-sp]')?.dataset.sp;
    if (!go && !act) return;
    try {
      if (go) { await surpriseGo(go); msg(`Surprise lancée pour ${go} !`); }
      else if (act === 'go') {
        if (!confirm('Lancer la surprise pour tous les joueurs devant l\'écran noir ?')) return;
        const n = await surpriseGo(null);
        msg(n ? `Surprise lancée pour ${n} joueur${n > 1 ? 's' : ''} !` : 'Personne n\'attend devant l\'écran noir.');
      } else if (act === 'invite' || act === 'prepare') {
        const u = q('.sp-u').value.trim().toLowerCase();
        const st = q('.sp-st').value;
        const nb = Math.max(0, Number(q('.sp-nb').value) || 0);
        if (!u) { msg('Indique un pseudo.', true); return; }
        if (act === 'invite') { showLink(await createSurprise(u, st, nb), u); msg('Invitation surprise créée : envoie le lien.'); }
        else { await prepareSurprise(u, st, nb); msg(`${u} passera sur l'écran noir à sa prochaine visite (ou en rechargeant la page).`); }
      } else if (act === 'test') await prepareTest();
      else if (act === 'retest') { await resetTest(TEST.user, TEST.deck, 10); msg('Compte test remis à zéro : recharge sa page, il est devant l\'écran noir.'); }
      else if (act === 'copy') { const i = q('.sp-link input'); i.select(); navigator.clipboard?.writeText(i.value).catch(() => {}); msg('Lien copié.'); return; }
      await refresh();
    } catch (err) { msg(err.message, true); }
  });
  refresh();
}
