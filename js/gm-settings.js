// Game Master → Paramètres du site : boosters gratuits, taux de rareté, règles de partie, maintenance.
import { S, saveSettings, loadSettings, DEFAULT_SETTINGS } from './store.js';
import { esc } from './cards.js';

const num = (k, label, help, min = 0, max = 100000, step = 1) => ({ k, label, help, min, max, step });
const SECTIONS = [
  ['Boosters gratuits', [
    num('free_minutes', 'Un booster gratuit toutes les (minutes)', '10 au départ', 1, 1440),
    num('free_max', 'Réserve maximale de boosters gratuits', '6 au départ', 0, 100),
  ]],
  ['Taux de rareté (dernière carte du booster : 1 sur N)', [
    num('rate_sr', 'Super rare : 1 booster sur', '4', 1),
    num('rate_ur', 'Ultra rare : 1 booster sur', '15', 1),
    num('rate_l', 'Légendaire : 1 booster sur', '50', 1),
    num('rate_s', '1on1 : 1 booster sur', '2000', 1),
    num('rate_god', 'God Pack (5 Légendaires) : 1 booster sur', '1000', 1),
    num('alt_pct', 'Alt : % des cartes tirées (−1 = tirées comme les autres)', '−1', -1, 100),
  ]],
  ['Règles de partie', [
    num('game.hand', 'Cartes en main au départ', '5', 1, 15),
    num('game.don_first', 'DON!! reçus au tout premier tour', '1', 0, 10),
    num('game.don_turn', 'DON!! reçus par tour ensuite', '2', 0, 10),
    num('game.don_max', 'DON!! au total (deck DON!!)', '10', 0, 30),
    num('game.life_bonus', 'Vies en plus (ou en moins) pour chaque Leader', '0', -4, 10),
  ]],
];
const get = (o, path) => path.split('.').reduce((x, k) => x?.[k], o);
const set = (o, path, v) => { const ks = path.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = (x[k] ||= {}); x[ks.at(-1)] = v; };

export function mountSettings(el) {
  const render = () => {
    const st = S.settings;
    el.innerHTML = `<h3>Paramètres du site</h3>
      <p class="muted small">Tout s'applique immédiatement pour tout le monde (les parties déjà commencées gardent leurs règles).</p>
      ${SECTIONS.map(([title, fields]) => `<fieldset class="gs-set"><legend>${title}</legend>${fields.map((f) => `
        <label class="gs-f"><span>${f.label}</span><input type="number" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${esc(get(st, f.k))}"><small class="muted">défaut ${f.help}</small></label>`).join('')}
        ${title === 'Règles de partie' ? `<label class="check"><input type="checkbox" data-k="game.mulligan" ${st.game.mulligan ? 'checked' : ''}> Mulligan autorisé</label>` : ''}</fieldset>`).join('')}
      <fieldset class="gs-set"><legend>Maintenance et message</legend>
        <label class="check"><input type="checkbox" data-k="maintenance.on" ${st.maintenance.on ? 'checked' : ''}> Site en maintenance (tout le monde est bloqué sauf toi)</label>
        <label class="gs-f wide"><span>Message de maintenance</span><input type="text" data-k="maintenance.msg" maxlength="200" value="${esc(st.maintenance.msg)}" placeholder="Le jeu est en maintenance. Reviens dans quelques minutes !"></label>
        <label class="gs-f wide"><span>Bandeau affiché à tous (vide = aucun)</span><input type="text" data-k="banner" maxlength="200" value="${esc(st.banner)}" placeholder="ex. Tournoi ce soir à 21 h !"></label>
      </fieldset>
      <div class="row-btns"><button class="btn main" data-gs="save">Enregistrer</button><button class="btn ghost" data-gs="reset">Revenir aux valeurs par défaut</button></div>
      <p class="msg gs-msg" role="status"></p>`;
  };
  const msg = (t, err = false) => { el.querySelector('.gs-msg').textContent = t; el.querySelector('.gs-msg').classList.toggle('err', err); };
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-gs]')?.dataset.gs;
    if (!act) return;
    try {
      let d;
      if (act === 'reset') {
        if (!confirm('Remettre tous les paramètres par défaut ?')) return;
        d = {};
      } else {
        d = structuredClone(S.settings);
        for (const i of el.querySelectorAll('[data-k]')) {
          const v = i.type === 'checkbox' ? i.checked : i.type === 'number' ? Number(i.value) : i.value.trim();
          if (i.type === 'number' && (!Number.isFinite(v) || v < Number(i.min) || v > Number(i.max))) { msg(`Valeur invalide : ${i.closest('label').querySelector('span').textContent}`, true); return; }
          set(d, i.dataset.k, v);
        }
        if (d.maintenance.on && !S.settings.maintenance.on && !confirm('Activer la maintenance ? Tous les joueurs seront bloqués jusqu\'à ce que tu la désactives.')) return;
      }
      // On n'enregistre que ce qui diffère des valeurs par défaut.
      await saveSettings(diff(d, DEFAULT_SETTINGS));
      render();
      msg('Paramètres enregistrés.');
      window.dispatchEvent(new CustomEvent('nk:settings'));
    } catch (err) { msg(err.message, true); }
  });
  loadSettings().catch(() => {}).then(render);
}

function diff(d, def) {
  const out = {};
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { const sub = diff(v, def[k] || {}); if (Object.keys(sub).length) out[k] = sub; } else if (v !== def[k]) out[k] = v;
  }
  return out;
}
