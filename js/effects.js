// Langage des effets de cartes : déclencheurs, conditions, coûts, actions, cibles.
// Une carte peut avoir plusieurs effets : card.effects = [{ when, once, conds, costs, actions }].
// Ce fichier décrit chaque bloc (pour l'éditeur) et sait écrire le texte de la carte.

export const COLORS_FR = { rouge: 'rouge', vert: 'vert', bleu: 'bleu', violet: 'violet', noir: 'noir', jaune: 'jaune' };

// ---------- Déclencheurs ----------
export const WHEN = {
  onPlay: { label: 'Jouée', tag: '[Jouée]' },
  onAttack: { label: 'Attaque', tag: '[Attaque]' },
  onBlock: { label: 'Bloquée', tag: '[Bloquée]' },
  onKO: { label: 'KO', tag: '[KO]' },
  activateMain: { label: 'Activation : Principale', tag: '[Activation : Principale]' },
  main: { label: 'Principale (Événement)', tag: '[Principale]' },
  counter: { label: 'Contre (Événement)', tag: '[Contre]' },
  trigger: { label: 'Déclenchement (depuis la Vie)', tag: '' },
  startOfTurn: { label: 'Début de votre tour', tag: '[Début de votre tour]' },
  endOfTurn: { label: 'Fin de votre tour', tag: '[Fin de votre tour]' },
  endOfOppTurn: { label: 'Fin du tour adverse', tag: '[Fin du tour adverse]' },
  yourTurn: { label: 'Votre tour (permanent)', tag: '[Votre tour]', continuous: true },
  oppTurn: { label: 'Tour adverse (permanent)', tag: '[Tour adverse]', continuous: true },
  static: { label: 'Permanent', tag: '', continuous: true },
  onOppAttack: { label: 'Quand l\'adversaire attaque', tag: '[Quand l\'adversaire attaque]' },
  // subject : l'effet regarde la carte concernée, qu'on peut filtrer (e.wf : type, nom…).
  onOwnKO: { label: 'Quand un de vos Personnages est mis KO', subject: true, phrase: (f) => `Quand un de vos Personnages${filterText(f)} est mis KO` },
  onOwnLeave: { label: 'Quand un de vos Personnages quitte le terrain', subject: true, phrase: (f) => `Quand un de vos Personnages${filterText(f)} quitte le terrain` },
  onLifeLost: { label: 'Quand vous perdez une Vie', tag: '[Quand vous perdez une Vie]' },
  onPlayChar: { label: 'Quand vous jouez un Personnage', subject: true, phrase: (f) => `Quand vous jouez un Personnage${filterText(f)}` },
};

// ---------- Types de paramètres ----------
// num : nombre ; text : texte libre ; sel : liste (opts) ; target : cible ; filter : filtre de cartes.
const n = (k = 'n', label = 'Nombre', def = 1) => ({ k, label, type: 'num', def });
const DUR = {
  k: 'dur', label: 'Durée', type: 'sel', def: 'turn',
  opts: { battle: 'pendant ce combat', turn: 'jusqu\'à la fin du tour', perm: 'en permanence' },
};
const TARGET = (def = {}) => ({ k: 't', label: 'Cible', type: 'target', def: { side: 'mine', who: 'self', n: 1, ...def } });
const FILTER = { k: 'f', label: 'Filtre', type: 'filter', def: {} };
export const KEYWORDS_AUTO = {
  blocker: 'Bloqueur', rush: 'Initiative', double: 'Double attaque', banish: 'Exil', unblockable: 'Imblocable',
};

// ---------- Conditions ----------
export const CONDS = {
  donAttached: { label: 'DON!! attachés à cette carte (min.)', params: [n('n', 'DON!!')], text: (p) => `[DON!! x${p.n}]` },
  donField: { label: 'DON!! sur votre terrain (min.)', params: [n('n', 'DON!!', 5)], text: (p) => `Si vous avez ${p.n} DON!! ou plus sur votre terrain,` },
  leaderType: { label: 'Votre Leader a le type…', params: [{ k: 'v', label: 'Type', type: 'text', def: '' }], text: (p) => `Si votre Leader a le type {${p.v}},` },
  leaderColor: { label: 'Votre Leader est de couleur…', params: [{ k: 'v', label: 'Couleur', type: 'sel', def: 'rouge', opts: COLORS_FR }], text: (p) => `Si votre Leader est ${p.v},` },
  leaderAttr: { label: 'Votre Leader a l\'attribut…', params: [{ k: 'v', label: 'Attribut', type: 'text', def: 'Frappe' }], text: (p) => `Si votre Leader a l'attribut ${p.v},` },
  lifeLE: { label: 'Vous avez X Vies ou moins', params: [n('n', 'Vies', 2)], text: (p) => `Si vous avez ${p.n} Vie${p.n > 1 ? 's' : ''} ou moins,` },
  lifeGE: { label: 'Vous avez X Vies ou plus', params: [n('n', 'Vies', 3)], text: (p) => `Si vous avez ${p.n} Vies ou plus,` },
  oppLifeLE: { label: 'L\'adversaire a X Vies ou moins', params: [n('n', 'Vies', 2)], text: (p) => `Si votre adversaire a ${p.n} Vie${p.n > 1 ? 's' : ''} ou moins,` },
  handLE: { label: 'Vous avez X cartes ou moins en main', params: [n('n', 'Cartes', 3)], text: (p) => `Si vous avez ${p.n} carte${p.n > 1 ? 's' : ''} ou moins en main,` },
  charsGE: {
    label: 'Vous avez X Personnages ou plus', params: [n('n', 'Personnages', 2), { k: 'type', label: 'Type (facultatif)', type: 'text', def: '' }],
    text: (p) => `Si vous avez ${p.n} Personnages${p.type ? ` de type {${p.type}}` : ''} ou plus,`,
  },
  trashGE: { label: 'Votre défausse a X cartes ou plus', params: [n('n', 'Cartes', 10)], text: (p) => `Si votre défausse contient ${p.n} cartes ou plus,` },
  myTurn: { label: 'C\'est votre tour', params: [], text: () => 'Pendant votre tour,' },
  oppTurn: { label: 'C\'est le tour adverse', params: [], text: () => 'Pendant le tour adverse,' },
};

// ---------- Coûts ----------
const CIRCLED = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
export const COSTS = {
  restDon: { label: 'Reposer X DON!! actifs', params: [n('n', 'DON!!')], text: (p) => CIRCLED[p.n] || `${p.n} DON!!` },
  donReturn: { label: 'Renvoyer X DON!! au deck DON!! (DON!! −X)', params: [n('n', 'DON!!')], text: (p) => `DON!! −${p.n}` },
  discard: { label: 'Défausser X cartes de sa main', params: [n('n', 'Cartes')], text: (p) => `Défaussez ${p.n} carte${p.n > 1 ? 's' : ''} de votre main` },
  restSelf: { label: 'Reposer cette carte', params: [], text: () => 'Reposez cette carte' },
  koOwn: { label: 'Mettre KO un de ses Personnages', params: [], text: () => 'Mettez KO 1 de vos Personnages' },
  trashToDeck: { label: 'Placer X cartes de sa défausse sous son deck', params: [n('n', 'Cartes', 3)], text: (p) => `Placez ${p.n} cartes de votre défausse sous votre deck` },
  lifeToHand: { label: 'Prendre une de ses Vies en main', params: [], text: () => 'Ajoutez 1 de vos Vies à votre main' },
  revealHand: { label: 'Révéler une carte de sa main', params: [FILTER], text: (p) => `Révélez 1 carte${filterText(p.f)} de votre main` },
};

// ---------- Actions ----------
export const ACTION_GROUPS = {
  'Pioche et main': ['draw', 'discard', 'oppDiscard'],
  Deck: ['look', 'search', 'mill'],
  Terrain: ['playFree', 'ko', 'bounce', 'toBottom', 'rest', 'untap', 'freeze', 'playSelf'],
  Puissance: ['power', 'cost', 'grantKw'],
  'DON!!': ['donAdd', 'donAttach', 'donUntap', 'donOppReturn', 'restOppDon'],
  Vie: ['lifeFromDeck', 'lifeFromHand', 'lifeToHand', 'oppLifeRemove', 'lifeLook'],
  Combat: ['protect', 'cannotAttack', 'redirect', 'noBlockers', 'negate'],
};

const ZONES = { hand: 'votre main', trash: 'votre défausse', deck: 'votre deck' };
export const ACTIONS = {
  draw: { label: 'Piocher', params: [n('n', 'Cartes')], text: (p) => `piochez ${p.n} carte${p.n > 1 ? 's' : ''}` },
  discard: {
    label: 'Défausser (au choix)', params: [n('n', 'Cartes'), { k: 'random', label: 'Au hasard', type: 'sel', def: 'no', opts: { no: 'non', yes: 'oui' } }],
    text: (p) => `défaussez ${p.n} carte${p.n > 1 ? 's' : ''} de votre main${p.random === 'yes' ? ' au hasard' : ''}`,
  },
  oppDiscard: { label: 'L\'adversaire défausse', params: [n('n', 'Cartes')], text: (p) => `votre adversaire défausse ${p.n} carte${p.n > 1 ? 's' : ''} de sa main` },
  look: {
    label: 'Regarder le dessus du deck et prendre', params: [n('n', 'Cartes regardées', 5), n('take', 'Cartes prises (max)', 1), FILTER,
      { k: 'rest', label: 'Le reste', type: 'sel', def: 'bottom', opts: { bottom: 'sous le deck', trash: 'à la défausse' } }],
    text: (p) => `regardez les ${p.n} cartes du dessus de votre deck, révélez jusqu'à ${p.take} carte${p.take > 1 ? 's' : ''}${filterText(p.f, true)} et ajoutez-la à votre main, puis placez le reste ${p.rest === 'trash' ? 'dans votre défausse' : 'sous votre deck dans l\'ordre de votre choix'}`,
  },
  search: { label: 'Chercher une carte dans le deck', params: [FILTER], text: (p) => `cherchez dans votre deck 1 carte${filterText(p.f, true)}, ajoutez-la à votre main, puis mélangez votre deck` },
  mill: { label: 'Défausser le dessus du deck', params: [n('n', 'Cartes', 2)], text: (p) => `placez les ${p.n} cartes du dessus de votre deck dans votre défausse` },
  playFree: {
    label: 'Jouer gratuitement une carte', params: [{ k: 'max', label: 'Coût max (vide = sans limite)', type: 'num', def: '' }, FILTER,
      { k: 'from', label: 'Depuis', type: 'sel', def: 'hand', opts: ZONES }],
    text: (p) => `jouez jusqu'à 1 ${p.f?.cardType === 'stage' ? 'Lieu' : p.f?.cardType === 'character' ? 'Personnage' : 'carte'}${filterText({ ...p.f, cardType: '' })}${p.max !== '' && p.max !== undefined ? ` de coût ${p.max} ou moins` : ''} depuis ${ZONES[p.from]}`,
  },
  ko: { label: 'Mettre KO', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `mettez KO ${targetText(p.t)}` },
  bounce: { label: 'Renvoyer en main', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `renvoyez ${targetText(p.t)} dans la main de son propriétaire` },
  toBottom: { label: 'Placer sous le deck', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `placez ${targetText(p.t)} sous le deck de son propriétaire` },
  rest: { label: 'Reposer', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `reposez ${targetText(p.t)}` },
  untap: { label: 'Redresser', params: [TARGET({ side: 'mine', who: 'leaderOrChar', n: 1 })], text: (p) => `redressez ${targetText(p.t)}` },
  freeze: { label: 'Ne se redresse pas au prochain tour', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `${targetText(p.t)} ne se redresse pas lors de la prochaine phase de rafraîchissement de son propriétaire` },
  playSelf: { label: 'Jouer cette carte (Déclenchement)', params: [], text: () => 'jouez cette carte' },
  power: {
    label: 'Puissance + / −', params: [TARGET({ side: 'mine', who: 'leaderOrChar', n: 1 }), n('amount', 'Puissance (+ ou −)', 1000), DUR],
    text: (p) => `${targetText(p.t)} ${p.amount >= 0 ? `gagne +${p.amount}` : `perd ${-p.amount}`} de puissance ${DUR.opts[p.dur]}`,
  },
  cost: {
    label: 'Coût + / −', params: [TARGET({ side: 'opp', who: 'chars', n: 1 }), n('amount', 'Coût (+ ou −)', -2), DUR],
    text: (p) => `${targetText(p.t)} ${p.amount >= 0 ? 'gagne' : 'perd'} ${Math.abs(p.amount)} de coût ${DUR.opts[p.dur]}`,
  },
  grantKw: {
    label: 'Donner un mot-clé', params: [TARGET({ side: 'mine', who: 'chars', n: 1 }),
      { k: 'kw', label: 'Mot-clé', type: 'sel', def: 'blocker', opts: KEYWORDS_AUTO }, DUR],
    text: (p) => `${targetText(p.t)} gagne [${KEYWORDS_AUTO[p.kw]}] ${DUR.opts[p.dur]}`,
  },
  donAdd: {
    label: 'Ajouter des DON!!', params: [n('n', 'DON!!'), { k: 'state', label: 'État', type: 'sel', def: 'rested', opts: { rested: 'reposé(s)', active: 'actif(s)' } }],
    text: (p) => `ajoutez jusqu'à ${p.n} DON!! de votre deck DON!! et ${p.state === 'active' ? 'gardez-les actifs' : 'reposez-les'}`,
  },
  donAttach: { label: 'Attacher des DON!! reposés', params: [n('n', 'DON!!'), TARGET({ side: 'mine', who: 'leaderOrChar', n: 1 })], text: (p) => `attachez jusqu'à ${p.n} DON!! reposé${p.n > 1 ? 's' : ''} à ${targetText(p.t)}` },
  donUntap: { label: 'Redresser des DON!!', params: [n('n', 'DON!!')], text: (p) => `redressez jusqu'à ${p.n} de vos DON!!` },
  donOppReturn: { label: 'L\'adversaire renvoie des DON!!', params: [n('n', 'DON!!')], text: (p) => `votre adversaire renvoie ${p.n} DON!! de son terrain dans son deck DON!!` },
  restOppDon: { label: 'Reposer des DON!! adverses', params: [n('n', 'DON!!')], text: (p) => `reposez jusqu'à ${p.n} DON!! de votre adversaire` },
  lifeFromDeck: { label: 'Ajouter le dessus du deck à sa Vie', params: [n('n', 'Cartes')], text: (p) => `ajoutez jusqu'à ${p.n} carte${p.n > 1 ? 's' : ''} du dessus de votre deck au-dessus de votre Vie` },
  lifeFromHand: { label: 'Ajouter une carte de sa main à sa Vie', params: [n('n', 'Cartes')], text: (p) => `ajoutez jusqu'à ${p.n} carte${p.n > 1 ? 's' : ''} de votre main au-dessus de votre Vie` },
  lifeToHand: { label: 'Prendre une de ses Vies en main', params: [n('n', 'Vies')], text: (p) => `ajoutez ${p.n} de vos Vies à votre main` },
  oppLifeRemove: {
    label: 'Retirer une Vie adverse', params: [n('n', 'Vies'), { k: 'to', label: 'Vers', type: 'sel', def: 'trash', opts: { trash: 'sa défausse', hand: 'sa main' } }],
    text: (p) => `placez ${p.n} des Vies de votre adversaire dans ${p.to === 'hand' ? 'sa main' : 'sa défausse'}`,
  },
  lifeLook: { label: 'Regarder et réordonner ses Vies', params: [], text: () => 'regardez toutes vos Vies et replacez-les dans l\'ordre de votre choix' },
  protect: {
    label: 'Ne peut pas être mis KO', params: [TARGET({ side: 'mine', who: 'self', n: 1 }),
      { k: 'by', label: 'Par', type: 'sel', def: 'both', opts: { battle: 'en combat', effect: 'par effet', both: 'en combat ni par effet' } }, DUR],
    text: (p) => `${targetText(p.t)} ne peut pas être mis KO ${p.by === 'battle' ? 'en combat' : p.by === 'effect' ? 'par des effets' : 'en combat ni par des effets'} ${DUR.opts[p.dur]}`,
  },
  cannotAttack: { label: 'Ne peut pas attaquer', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `${targetText(p.t)} ne peut pas attaquer jusqu'à la fin du prochain tour adverse` },
  redirect: { label: 'Changer la cible de l\'attaque', params: [], text: () => 'choisissez votre Leader ou un de vos Personnages : il devient la cible de l\'attaque' },
  noBlockers: { label: 'L\'adversaire ne peut pas bloquer', params: [], text: () => 'votre adversaire ne peut pas activer de [Bloqueur] pendant ce combat' },
  negate: { label: 'Annuler les effets', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `${targetText(p.t)} perd ses effets jusqu'à la fin du tour` },
};

// Actions possibles dans un effet permanent (Votre tour / Tour adverse / Permanent).
export const CONTINUOUS_ACTIONS = ['power', 'cost', 'grantKw', 'protect'];

// ---------- Cibles ----------
export const SIDES = { mine: 'à vous', opp: 'adverse' };
export const WHO = {
  self: 'cette carte', leader: 'Leader', chars: 'Personnage(s)', leaderOrChar: 'Leader ou Personnage', allChars: 'tous les Personnages', leaderAndAll: 'Leader et tous les Personnages',
};

export function filterText(f = {}, short = false) {
  const parts = [];
  if (f.name) parts.push(`[${f.name}]`);
  if (f.type) parts.push(`de type {${f.type}}`);
  if (f.color) parts.push(f.color);
  if (f.attr) parts.push(`d'attribut ${f.attr}`);

  if (f.cardType) parts.push(`de type ${{ character: 'Personnage', event: 'Événement', stage: 'Lieu', leader: 'Leader' }[f.cardType]}`);
  if (f.maxCost !== undefined && f.maxCost !== '') parts.push(`de coût ${f.maxCost} ou moins`);
  if (f.minCost !== undefined && f.minCost !== '') parts.push(`de coût ${f.minCost} ou plus`);
  if (f.maxPower !== undefined && f.maxPower !== '') parts.push(`de puissance ${f.maxPower} ou moins`);
  if (f.maxBasePower !== undefined && f.maxBasePower !== '') parts.push(`de puissance de base ${f.maxBasePower} ou moins`);
  if (f.rested === 'yes') parts.push('reposé');
  if (f.rested === 'no') parts.push('actif');
  if (!parts.length) return '';
  return (short ? ' ' : ' ') + parts.join(' ');
}

export function targetText(t = {}) {
  const opp = t.side === 'opp';
  const f = filterText(t.f);
  switch (t.who) {
    case 'self': return 'cette carte';
    case 'leader': return opp ? 'le Leader adverse' : 'votre Leader';
    case 'allChars': return opp ? `tous les Personnages adverses${f}` : `tous vos Personnages${f}`;
    case 'leaderAndAll': return opp ? 'le Leader adverse et tous ses Personnages' : 'votre Leader et tous vos Personnages';
    case 'leaderOrChar': return opp ? `le Leader adverse ou jusqu'à ${t.n} Personnage${t.n > 1 ? 's' : ''} adverse${t.n > 1 ? 's' : ''}${f}`
      : `votre Leader ou jusqu'à ${t.n} de vos Personnages${f}`;
    default: return opp ? `jusqu'à ${t.n} Personnage${t.n > 1 ? 's' : ''} adverse${t.n > 1 ? 's' : ''}${f}` : `jusqu'à ${t.n} de vos Personnages${f}`;
  }
}

// ---------- Texte d'une carte ----------
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function effectText(e) {
  const w = WHEN[e.when] || {};
  const tag = w.subject ? `[${w.phrase(e.wf || {})}]` : w.tag;
  const head = [tag, e.once ? '[Une fois par tour]' : ''].filter(Boolean);
  const donCond = (e.conds || []).filter((c) => c.k === 'donAttached').map((c) => CONDS.donAttached.text(c));
  const otherConds = (e.conds || []).filter((c) => c.k !== 'donAttached' && CONDS[c.k]).map((c) => CONDS[c.k].text(c));
  const costs = (e.costs || []).filter((c) => COSTS[c.k]).map((c) => COSTS[c.k].text(c));
  const acts = (e.actions || []).filter((a) => ACTIONS[a.k]).map((a) => ACTIONS[a.k].text(a));
  let body = acts.join(', puis ');
  if (otherConds.length) body = `${otherConds.join(' ')} ${body}`;
  body = cap(body.trim());
  if (body && !body.endsWith('.')) body += '.';
  const costTxt = costs.length ? `${costs.join(', ')} : ` : '';
  return [...donCond, ...head].join(' ') + (head.length || donCond.length ? ' ' : '') + costTxt + body;
}

// { main, trigger } : texte généré depuis les effets structurés.
export function effectsText(card) {
  const list = card?.effects || [];
  const kws = (card?.keywords || []).map((k) => `[${KEYWORDS_AUTO[k]}]`).join(' ');
  const main = list.filter((e) => e.when !== 'trigger').map(effectText);
  const trig = list.filter((e) => e.when === 'trigger').map(effectText);
  return { main: [kws, ...main].filter(Boolean).join('\n'), trigger: trig.join(' ') };
}

// Valeurs par défaut d'un bloc (pour l'éditeur).
export function defaults(params) {
  const o = {};
  for (const p of params) o[p.k] = structuredClone(p.def);
  return o;
}
