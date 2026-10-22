// Constructeur d'effets (onglet Cartes) : menus déroulants → card.effects / card.keywords.
import {
  WHEN, CONDS, COSTS, ACTIONS, ACTION_GROUPS, CONTINUOUS_ACTIONS, SIDES, WHO, KEYWORDS_AUTO, COLORS_FR,
  effectText, defaults,
} from './effects.js';
import { esc, ATTRIBUTES } from './cards.js';

const SECTIONS = { conds: ['Conditions', CONDS], costs: ['Coûts', COSTS], actions: ['Actions', ACTIONS] };
const KW_SHOWN = ['blocker', 'rush', 'double', 'banish', 'unblockable'];

// card est modifié directement ; onChange() est appelé après chaque modification.
export function mountEffectsEditor(el, getCard, onChange) {
  el.addEventListener('change', (e) => handle(e, true));
  el.addEventListener('input', (e) => { if (e.target.matches('input[type=text], input[type=number]')) handle(e, false); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const card = getCard();
    const { act } = b.dataset;
    const block = b.closest('[data-i]');
    const i = block ? +block.dataset.i : -1;
    const row = b.closest('[data-j]');
    if (act === 'add-effect') card.effects.push({ when: 'onPlay', once: false, conds: [], costs: [], actions: [] });
    else if (act === 'del-effect') card.effects.splice(i, 1);
    else if (act === 'del') card.effects[i][row.dataset.sec].splice(+row.dataset.j, 1);
    else if (act === 'up' && +row.dataset.j > 0) {
      const arr = card.effects[i][row.dataset.sec];
      const j = +row.dataset.j;
      [arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
    } else return;
    render();
    onChange();
  });

  function handle(e, structural) {
    const card = getCard();
    const t = e.target;
    if (t.dataset.kw) {
      const set = new Set(card.keywords || []);
      if (t.checked) set.add(t.dataset.kw); else set.delete(t.dataset.kw);
      card.keywords = [...set];
      onChange();
      return;
    }
    const block = t.closest('[data-i]');
    if (!block) return;
    const eff = card.effects[+block.dataset.i];
    if (t.dataset.add) {
      const sec = t.dataset.add;
      const k = t.value;
      if (k) eff[sec].push({ k, ...defaults(SECTIONS[sec][1][k].params) });
      render();
      onChange();
      return;
    }
    if (t.dataset.f === 'when') eff.when = t.value;
    else if (t.dataset.f === 'once') eff.once = t.checked;
    else if (t.dataset.p) {
      const row = t.closest('[data-j]');
      const item = eff[row.dataset.sec][+row.dataset.j];
      setPath(item, t.dataset.p, t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value);
    }
    if (structural) render(); else block.querySelector('.fxe-text').textContent = effectText(eff);
    onChange();
  }

  function render() {
    const card = getCard();
    card.effects ||= [];
    card.keywords ||= [];
    el.innerHTML = `
      <div class="fxe-kws"><b>Mots-clés</b>
        ${KW_SHOWN.map((k) => `<label class="check"><input type="checkbox" data-kw="${k}" ${card.keywords.includes(k) ? 'checked' : ''}> ${KEYWORDS_AUTO[k]}</label>`).join('')}
      </div>
      ${card.effects.map((eff, i) => blockHTML(eff, i, card)).join('')}
      <button type="button" class="btn" data-act="add-effect">+ Ajouter un effet automatique</button>`;
  }

  render();
  return { render };
}

function blockHTML(eff, i, card) {
  const w = WHEN[eff.when] || {};
  const allowed = Object.entries(WHEN).filter(([k]) => {
    if (k === 'main' || k === 'counter') return card.type === 'event';
    if (k === 'trigger') return card.type !== 'leader';
    if (card.type === 'event') return ['main', 'counter', 'trigger'].includes(k);
    return true;
  });
  return `<div class="fxe-block" data-i="${i}">
    <div class="fxe-head">
      <label>Quand <select data-f="when">${allowed.map(([k, v]) => `<option value="${k}" ${k === eff.when ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-f="once" ${eff.once ? 'checked' : ''}> Une fois par tour</label>
      <button type="button" class="btn small danger" data-act="del-effect">Supprimer l'effet</button>
    </div>
    ${sectionHTML(eff, 'conds')}
    ${w.continuous ? '' : sectionHTML(eff, 'costs')}
    ${sectionHTML(eff, 'actions', w.continuous)}
    <p class="fxe-text">${esc(effectText(eff))}</p>
  </div>`;
}

function sectionHTML(eff, sec, continuous = false) {
  const [title, defs] = SECTIONS[sec];
  const rows = eff[sec].map((item, j) => {
    const def = defs[item.k];
    if (!def) return '';
    return `<div class="fxe-row" data-sec="${sec}" data-j="${j}">
      <span class="fxe-label">${esc(def.label)}</span>
      ${def.params.map((p) => paramHTML(p, item)).join('')}
      <span class="fxe-tools">${j ? '<button type="button" class="btn small ghost" data-act="up" title="Monter">↑</button>' : ''}<button type="button" class="btn small ghost" data-act="del" title="Retirer">×</button></span>
    </div>`;
  }).join('');
  let options;
  if (sec === 'actions') {
    options = Object.entries(ACTION_GROUPS).map(([g, keys]) => {
      const ks = continuous ? keys.filter((k) => CONTINUOUS_ACTIONS.includes(k)) : keys;
      return ks.length ? `<optgroup label="${g}">${ks.map((k) => `<option value="${k}">${esc(ACTIONS[k].label)}</option>`).join('')}</optgroup>` : '';
    }).join('');
  } else options = Object.entries(defs).map(([k, d]) => `<option value="${k}">${esc(d.label)}</option>`).join('');
  return `<div class="fxe-sec"><div class="fxe-sec-title">${title}</div>${rows}
    <select data-add="${sec}" class="fxe-add"><option value="">+ Ajouter ${sec === 'conds' ? 'une condition' : sec === 'costs' ? 'un coût' : 'une action'}…</option>${options}</select></div>`;
}

function paramHTML(p, item) {
  const v = item[p.k];
  if (p.type === 'num') return `<label>${esc(p.label)} <input type="number" data-p="${p.k}" value="${esc(v)}"></label>`;
  if (p.type === 'text') return `<label>${esc(p.label)} <input type="text" data-p="${p.k}" value="${esc(v)}"></label>`;
  if (p.type === 'sel') return `<label>${esc(p.label)} ${select(p.k, p.opts, v)}</label>`;
  if (p.type === 'filter') return filterHTML(p.k, v || {});
  if (p.type === 'target') {
    const t = v || {};
    const needN = !['self', 'leader', 'allChars', 'leaderAndAll'].includes(t.who);
    return `<span class="fxe-target">
      <label>Camp ${select(`${p.k}.side`, SIDES, t.side)}</label>
      <label>Qui ${select(`${p.k}.who`, WHO, t.who)}</label>
      ${needN ? `<label>Jusqu'à <input type="number" min="1" data-p="${p.k}.n" value="${esc(t.n)}"></label>` : ''}
      ${['self', 'leader'].includes(t.who) ? '' : filterHTML(`${p.k}.f`, t.f || {})}
    </span>`;
  }
  return '';
}

function filterHTML(path, f) {
  return `<span class="fxe-filter">
    <label>Type <input type="text" data-p="${path}.type" value="${esc(f.type || '')}" placeholder="ex. Marine"></label>
    <label>Couleur ${select(`${path}.color`, { '': '—', ...COLORS_FR }, f.color || '')}</label>
    <label>Attribut ${select(`${path}.attr`, { '': '—', ...Object.fromEntries(ATTRIBUTES.map((a) => [a, a])) }, f.attr || '')}</label>
    <label>Coût max <input type="number" data-p="${path}.maxCost" value="${esc(f.maxCost ?? '')}"></label>
    <label>Puissance max <input type="number" step="1000" data-p="${path}.maxPower" value="${esc(f.maxPower ?? '')}"></label>
    <label>État ${select(`${path}.rested`, { '': '—', yes: 'reposé', no: 'actif' }, f.rested || '')}</label>
  </span>`;
}

function select(path, opts, v) {
  return `<select data-p="${path}">${Object.entries(opts).map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ||= {});
  const last = keys.at(-1);
  if (value === '' && keys.length > 1) delete o[last];
  else o[last] = value;
}
