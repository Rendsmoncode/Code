// Écran de connexion / création de compte, et choix du deck préconstruit.
import { S, signIn, signUp, claimStarter, validateDeck, inviteInfo } from './store.js';
import { esc, cardHTML } from './cards.js';

export async function showAuth() {
  let mode = 'in';
  const token = new URLSearchParams(location.search).get('invite');
  const invite = token ? await inviteInfo(token) : null;
  if (invite) mode = 'up';
  const el = document.createElement('div');
  el.className = 'auth';
  document.body.append(el);
  render();

  function render() {
    el.innerHTML = `
    <form class="panel auth-box" autocomplete="on">
      <h1>OPTCG <span>Maison</span></h1>
      <div class="seg" role="tablist">
        <button type="button" data-mode="in" class="${mode === 'in' ? 'on' : ''}">Se connecter</button>
        <button type="button" data-mode="up" class="${mode === 'up' ? 'on' : ''}">Créer un compte</button>
      </div>
      ${token && !invite ? '<p class="msg err">Ce lien d\'invitation n\'est plus valable (il a peut-être déjà servi). Connectez-vous, ou demandez un nouveau lien.</p>' : ''}
      ${invite && mode === 'up' ? `<p class="invite-hello">Bienvenue <b>${esc(invite.username)}</b> ! ${invite.starter ? `Votre deck « ${esc(invite.starter)} »` : 'Votre compte'}${invite.boosters ? ` et ${invite.boosters} booster${invite.boosters > 1 ? 's' : ''}` : ''} vous attend${invite.starter && invite.boosters ? 'ent' : ''}. Choisissez simplement votre mot de passe.</p>` : ''}
      <div class="field"><label for="au-user">Pseudo</label>
        <input id="au-user" name="username" autocomplete="username" required maxlength="20" placeholder="ex. : ayoub"
          ${invite && mode === 'up' ? `value="${esc(invite.username)}" readonly` : ''}></div>
      <div class="field"><label for="au-pass">Mot de passe</label>
        <input id="au-pass" name="password" type="password" required minlength="6" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}"></div>
      ${mode === 'up' ? `<div class="field"><label for="au-pass2">Confirmer le mot de passe</label>
        <input id="au-pass2" type="password" required minlength="6" autocomplete="new-password"></div>
        ${invite ? '' : '<p class="muted small">L\'inscription se fait avec le lien d\'invitation personnel envoyé par l\'organisateur.</p>'}` : ''}
      <button class="btn primary big">${mode === 'in' ? 'Se connecter' : 'Créer mon compte'}</button>
      <p class="msg err au-msg" role="alert"></p>
    </form>`;
  }

  el.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]')?.dataset.mode;
    if (m && m !== mode) { mode = m; render(); }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = el.querySelector('#au-user').value;
    const p = el.querySelector('#au-pass').value;
    const out = el.querySelector('.au-msg');
    if (mode === 'up' && p !== el.querySelector('#au-pass2').value) { out.textContent = 'Les mots de passe ne correspondent pas.'; return; }
    out.textContent = '';
    el.querySelector('.btn.primary').disabled = true;
    try {
      if (mode === 'in') await signIn(u, p); else await signUp(u, p, invite ? token : null);
      // On retire le jeton d'invitation de l'adresse avant de recharger.
      const url = new URL(location.href);
      url.searchParams.delete('invite');
      location.replace(url.href);
    } catch (err) {
      out.textContent = err.message;
      el.querySelector('.btn.primary').disabled = false;
    }
  });
}

// Propose un deck préconstruit au joueur qui n'en a pas encore reçu.
export function maybeAskStarter() {
  if (S.status?.starter_claimed) return;
  const starters = S.starters.filter((d) => validateDeck(d, { owned: false }).ok);
  if (!starters.length) return;
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="dialog wide" role="dialog" aria-label="Choisissez votre deck de départ">
    <h3>Bienvenue ${esc(S.status.username)} ! Choisissez votre deck de départ</h3>
    <p class="muted">Vous recevez toutes ses cartes et le deck tout prêt. Ce choix est définitif.</p>
    <div class="starters">${starters.map((d) => `<button class="starter" data-id="${d.id}">
      ${cardHTML(S.byId[d.leader])}<b>${esc(d.name)}</b></button>`).join('')}</div>
    <p class="msg err st-msg"></p></div>`;
  document.body.append(o);
  o.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const d = starters.find((x) => x.id === b.dataset.id);
    if (!confirm(`Prendre le deck « ${d.name} » ?`)) return;
    try {
      await claimStarter(d.id);
      o.remove();
    } catch (err) { o.querySelector('.st-msg').textContent = err.message; }
  });
}
