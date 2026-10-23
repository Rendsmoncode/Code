// Onglet « Crédits » : auteurs et licences des photos libres utilisées sur les cartes.
import { S, onChange } from './store.js';
import { esc } from './cards.js';

export function initCredits() {
  const el = document.getElementById('tab-credits');
  const render = () => {
    const list = S.cards.filter((c) => c.credit?.author).sort((a, b) => (a.code || '').localeCompare(b.code || '') || a.name.localeCompare(b.name));
    el.innerHTML = `<section class="panel credits">
      <h2>Crédits photos</h2>
      <p class="muted">Les photos de personnes réelles viennent de Wikimedia Commons et sont publiées sous licence libre par leurs auteurs. Merci à eux !</p>
      ${list.length ? `<table class="tbl"><thead><tr><th>Carte</th><th>Auteur</th><th>Licence</th><th>Source</th></tr></thead><tbody>
        ${list.map((c) => `<tr><td><b>${esc(c.name)}</b> <span class="muted small">${esc(c.code || '')}</span></td>
          <td>${esc(c.credit.author)}</td><td>${esc(c.credit.license || '')}</td>
          <td>${c.credit.source ? `<a href="${esc(c.credit.source)}" target="_blank" rel="noopener">${esc(c.credit.file || 'Voir la photo')}</a>` : ''}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Aucune photo créditée pour l\'instant.</p>'}
    </section>`;
  };
  onChange(render);
  render();
}
