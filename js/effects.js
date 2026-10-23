// Langage des effets de cartes : déclencheurs, conditions, coûts, actions, cibles.
// Une carte peut avoir plusieurs effets : card.effects = [{ when, once, conds, costs, actions }].
// Ce fichier décrit chaque bloc (pour l'éditeur) et sait écrire le texte de la carte.

const CMP = { le: 'inférieur ou égal à', lt: 'inférieur à', ge: 'supérieur ou égal à', gt: 'supérieur à' };
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
  onOwnLeaveOpp: { label: 'Quand un de vos Personnages quitte le terrain à cause d\'un effet adverse', subject: true, phrase: (f) => `Quand un de vos Personnages${filterText(f)} quitte le terrain à cause d'un effet adverse` },
  // Effet de remplacement : « Si ce Personnage devait être mis KO, vous pouvez … à la place. » (e.rp : événement et Personnage concerné)
  replace: { label: 'À la place (effet de remplacement)', subject: true, replace: true },
  onLifeLost: { label: 'Quand vous perdez une Vie', tag: '[Quand vous perdez une Vie]' },
  onPlayChar: { label: 'Quand vous jouez un Personnage', subject: true, phrase: (f) => `Quand vous jouez un Personnage${filterText(f)}` },
};

// ---------- Types de paramètres ----------
// num : nombre ; text : texte libre ; sel : liste (opts) ; target : cible ; filter : filtre de cartes.
const n = (k = 'n', label = 'Nombre', def = 1) => ({ k, label, type: 'num', def });
const DUR = {
  k: 'dur', label: 'Durée', type: 'sel', def: 'turn',
  opts: { battle: 'pendant ce combat', turn: 'jusqu\'à la fin du tour', next: 'jusqu\'à la fin du prochain tour adverse', perm: 'en permanence' },
};
const TARGET = (def = {}) => ({ k: 't', label: 'Cible', type: 'target', def: { side: 'mine', who: 'self', n: 1, ...def } });
const FILTER = { k: 'f', label: 'Filtre', type: 'filter', def: {} };
const LIFE_POS = { k: 'pos', label: 'Quelle Vie', type: 'sel', def: 'top', opts: { top: 'du dessus', bottom: 'du dessous', either: 'du dessus ou du dessous' } };
const FACE = { k: 'face', label: 'Face', type: 'sel', def: 'down', opts: { down: 'cachée', up: 'visible' } };
const STATE = { k: 'state', label: 'Arrive', type: 'sel', def: 'active', opts: { active: 'redressée', rested: 'épuisée' } };
// Durée écrite sur la carte (rien pour un effet permanent, où dur vaut null).
const durText = (d) => (d ? ` ${DUR.opts[d]}` : '');
// « gagne » ou « gagnent » selon la cible.
const verb = (t = {}, one, many) => (['allChars', 'leaderAndAll'].includes(t.who) || (t.who === 'chars' && t.n > 1) ? many : one);
export const UNLIMITED_TEXT = 'Selon les règles du jeu, vous pouvez avoir autant d\'exemplaires de cette carte que vous le souhaitez dans votre deck.';
export const KEYWORDS_AUTO = {
  blocker: 'Bloqueur', rush: 'Initiative', rushChar: 'Initiative : Personnage', double: 'Double attaque', banish: 'Exil', unblockable: 'Imblocable',
  unlimited: 'Exemplaires illimités',
};

// ---------- Conditions ----------
export const CONDS = {
  donAttached: { label: 'DON!! attachés à cette carte (min.)', params: [n('n', 'DON!!')], text: (p) => `[DON!! x${p.n}]` },
  donField: { label: 'DON!! sur votre terrain (min.)', params: [n('n', 'DON!!', 5)], text: (p) => `Si vous avez ${p.n} DON!! ou plus sur votre terrain,` },
  leaderType: { label: 'Votre Leader a le type…', params: [{ k: 'v', label: 'Type', type: 'text', def: '' }], text: (p) => `Si votre Leader a le type {${p.v}},` },
  leaderName: { label: 'Votre Leader est [Nom]', params: [{ k: 'v', label: 'Nom', type: 'text', def: '' }], text: (p) => `Si votre Leader est [${p.v}],` },
  leaderMulti: { label: 'Votre Leader est multicolore', params: [], text: () => 'Si votre Leader est multicolore,' },
  leaderColor: { label: 'Votre Leader est de couleur…', params: [{ k: 'v', label: 'Couleur', type: 'sel', def: 'rouge', opts: COLORS_FR }], text: (p) => `Si votre Leader est ${p.v},` },
  leaderAttr: { label: 'Votre Leader a l\'attribut…', params: [{ k: 'v', label: 'Attribut', type: 'text', def: 'Frappe' }], text: (p) => `Si votre Leader a l'attribut ${p.v},` },
  donFieldLE: { label: 'DON!! sur votre terrain (max.)', params: [n('n', 'DON!!', 5)], text: (p) => `Si vous avez ${p.n} cartes DON!! ou moins sur votre terrain,` },
  donCmp: {
    label: 'Vos DON!! comparés à ceux de l\'adversaire', params: [{ k: 'cmp', label: 'Vos DON!! sont', type: 'sel', def: 'le', opts: CMP }],
    text: (p) => `Si le nombre de cartes DON!! sur votre terrain est ${CMP[p.cmp]} celui de votre adversaire,`,
  },
  oppCount: {
    label: 'L\'adversaire a X DON!! / cartes en main / Personnages / Vies',
    params: [{ k: 'what', label: 'Quoi', type: 'sel', def: 'don', opts: { don: 'DON!! sur son terrain', hand: 'cartes en main', chars: 'Personnages', life: 'Vies' } },
      { k: 'cmp', label: 'Comparaison', type: 'sel', def: 'ge', opts: { ge: 'ou plus', le: 'ou moins' } }, n('n', 'Nombre', 3)],
    text: (p) => `Si votre adversaire a ${p.n} ${{ don: 'cartes DON!!', hand: 'cartes', chars: 'Personnages', life: 'cartes' }[p.what]} ${p.cmp === 'le' ? 'ou moins' : 'ou plus'}${{ don: ' sur son terrain', hand: ' dans sa main', chars: '', life: ' dans sa Vie' }[p.what]},`,
  },
  anyChar: {
    label: 'Il y a X Personnages (n\'importe quel camp / adverses) ayant…',
    params: [n('n', 'Personnages', 1), { k: 'side', label: 'Camp', type: 'sel', def: 'any', opts: { any: 'n\'importe lequel', opp: 'adverse' } }, FILTER],
    text: (p) => {
      const what = p.n > 1 ? `${p.n} Personnages${p.side === 'opp' ? ' adverses' : ''}${filterText(p.f)} ou plus` : `un Personnage${p.side === 'opp' ? ' adverse' : ''}${filterText(p.f)}`;
      return `S'il y a ${what},`;
    },
  },
  lifeLE: { label: 'Vous avez X Vies ou moins', params: [n('n', 'Vies', 2)], text: (p) => `Si vous avez ${p.n} Vie${p.n > 1 ? 's' : ''} ou moins,` },
  lifeGE: { label: 'Vous avez X Vies ou plus', params: [n('n', 'Vies', 3)], text: (p) => `Si vous avez ${p.n} Vies ou plus,` },
  oppLifeLE: { label: 'L\'adversaire a X Vies ou moins', params: [n('n', 'Vies', 2)], text: (p) => `Si votre adversaire a ${p.n} Vie${p.n > 1 ? 's' : ''} ou moins,` },
  handLE: { label: 'Vous avez X cartes ou moins en main', params: [n('n', 'Cartes', 3)], text: (p) => `Si vous avez ${p.n} carte${p.n > 1 ? 's' : ''} ou moins en main,` },
  charsGE: {
    label: 'Vous avez X Personnages ou plus (type, coût…)', params: [n('n', 'Personnages', 2), FILTER],
    // p.type : ancien format (avant le filtre complet), encore lu.
    text: (p) => {
      const f = { ...(p.f || {}), ...(p.type ? { type: p.type } : {}) };
      return `Si vous avez ${p.n > 1 ? `${p.n} Personnages` : 'un Personnage'}${filterText(f)}${p.n > 1 ? ' ou plus' : ''},`;
    },
  },
  typeFieldGE: {
    label: 'Vous avez X cartes de type… ou plus sur votre terrain',
    params: [n('n', 'Cartes', 2), { k: 'type', label: 'Type', type: 'text', def: '' }, { k: 'self', label: 'Cette carte', type: 'sel', def: 'count', opts: { count: 'compte aussi', skip: 'ne compte pas' } }],
    text: (p) => {
      const many = p.n > 1;
      const other = p.self === 'skip' ? (many ? 'autres ' : 'autre ') : '';
      return `Si vous avez ${many ? p.n : 'une'} ${other}carte${many ? 's' : ''} de type {${p.type}}${many ? ' ou plus' : ''} sur votre terrain,`;
    },
  },
  noTypeField: {
    label: 'Vous n\'avez aucune carte de type… sur votre terrain',
    params: [{ k: 'type', label: 'Type', type: 'text', def: '' }, { k: 'self', label: 'Cette carte', type: 'sel', def: 'skip', opts: { skip: 'ne compte pas', count: 'compte aussi' } }],
    text: (p) => `Si vous n'avez aucune ${p.self === 'count' ? '' : 'autre '}carte de type {${p.type}} sur votre terrain,`,
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
  discard: { label: 'Défausser X cartes de sa main (filtre possible)', params: [n('n', 'Cartes'), FILTER], text: (p) => `Défaussez ${p.n} carte${p.n > 1 ? 's' : ''}${filterText(p.f)} de votre main` },
  restSelf: { label: 'Reposer cette carte', params: [], text: () => 'Reposez cette carte' },
  trashSelf: { label: 'Placer cette carte dans la défausse', params: [], text: () => 'Placez cette carte dans votre Défausse' },
  restLeader: { label: 'Reposer son Leader', params: [], text: () => 'Reposez votre Leader' },
  koOwn: { label: 'Mettre KO un de ses Personnages', params: [], text: () => 'Mettez KO 1 de vos Personnages' },
  trashToDeck: { label: 'Placer X cartes de sa défausse sous son deck', params: [n('n', 'Cartes', 3)], text: (p) => `Placez ${p.n} cartes de votre défausse sous votre deck` },
  lifeToHand: { label: 'Prendre une de ses Vies en main', params: [LIFE_POS], text: (p) => `Ajoutez à votre main 1 carte ${LIFE_POS.opts[p.pos || 'top']} de votre Vie` },
  lifeFlip: { label: 'Retourner une Vie face visible', params: [], text: () => 'Retournez 1 carte du dessus de votre Vie face visible' },
  revealHand: { label: 'Révéler une carte de sa main', params: [FILTER], text: (p) => `Révélez 1 carte${filterText(p.f)} de votre main` },
};

// ---------- Actions ----------
export const ACTION_GROUPS = {
  'Pioche et main': ['draw', 'discard', 'oppDiscard', 'trashToHand'],
  Deck: ['look', 'search', 'mill'],
  Terrain: ['playSelf', 'playFree', 'useMain', 'ko', 'bounce', 'toBottom', 'rest', 'untap', 'freeze'],
  'Puissance et mots-clés': ['grantKw', 'power', 'cost'],
  'DON!!': ['donAdd', 'donAttach', 'donUntap', 'donOppReturn', 'restOppDon'],
  Vie: ['lifeFromDeck', 'lifeFromHand', 'lifeToHand', 'toLife', 'oppLifeRemove', 'lifeLook'],
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
  trashToHand: {
    label: 'Récupérer des cartes de sa défausse en main', params: [n('n', 'Cartes'), FILTER],
    text: (p) => `ajoutez à votre main jusqu'à ${p.n} carte${p.n > 1 ? 's' : ''}${filterText(p.f)} de votre défausse`,
  },
  mill: { label: 'Défausser le dessus du deck', params: [n('n', 'Cartes', 2)], text: (p) => `placez les ${p.n} cartes du dessus de votre deck dans votre défausse` },
  playFree: {
    label: 'Jouer gratuitement une carte', params: [{ k: 'max', label: 'Coût max (vide = sans limite)', type: 'num', def: '' }, FILTER,
      { k: 'from', label: 'Depuis', type: 'sel', def: 'hand', opts: ZONES }, STATE],
    text: (p) => `jouez jusqu'à 1 ${p.f?.cardType === 'stage' ? 'Lieu' : p.f?.cardType === 'character' ? 'Personnage' : 'carte'}${filterText({ ...p.f, cardType: '' })}${p.state === 'rested' ? (p.f?.cardType ? ' épuisé' : ' épuisée') : ''}${p.max !== '' && p.max !== undefined ? ` de coût ${p.max} ou moins` : ''} depuis ${ZONES[p.from]}`,
  },
  ko: { label: 'Mettre KO', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `mettez KO ${targetText(p.t)}` },
  bounce: { label: 'Renvoyer en main', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `renvoyez ${targetText(p.t)} dans la main de son propriétaire` },
  toBottom: { label: 'Placer sous le deck', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `placez ${targetText(p.t)} sous le deck de son propriétaire` },
  rest: { label: 'Reposer', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `reposez ${targetText(p.t)}` },
  untap: { label: 'Redresser', params: [TARGET({ side: 'mine', who: 'leaderOrChar', n: 1 })], text: (p) => `redressez ${targetText(p.t)}` },
  freeze: { label: 'Ne se redresse pas au prochain tour', params: [TARGET({ side: 'opp', who: 'chars', n: 1 })], text: (p) => `${targetText(p.t)} ne se redresse pas lors de la prochaine phase de rafraîchissement de son propriétaire` },
  playSelf: {
    label: 'Jouer cette carte', params: [{ k: 'from', label: 'Depuis', type: 'sel', def: 'trash', opts: { trash: 'la défausse', hand: 'la main', life: 'la Vie (Déclenchement)' } }, STATE],
    text: (p) => `jouez cette carte${p.state === 'rested' ? ' épuisée' : ''}${p.from === 'hand' ? ' depuis votre main' : p.from === 'life' ? '' : ' depuis votre défausse'}`,
  },
  useMain: { label: 'Activer l\'effet [Principale] de cette carte', params: [], text: () => 'activez l\'effet [Principale] de cette carte' },
  power: {
    label: 'Puissance + / −', params: [TARGET({ side: 'mine', who: 'leaderOrChar', n: 1 }), n('amount', 'Puissance (+ ou −)', 1000), DUR],
    text: (p) => `${targetText(p.t)} ${p.amount >= 0 ? `${verb(p.t, 'gagne', 'gagnent')} +${p.amount}` : `${verb(p.t, 'perd', 'perdent')} −${-p.amount}`} de puissance${durText(p.dur)}`,
  },
  cost: {
    label: 'Coût + / −', params: [TARGET({ side: 'opp', who: 'chars', n: 1 }), n('amount', 'Coût (+ ou −)', -2), DUR],
    text: (p) => `${targetText(p.t)} ${p.amount >= 0 ? verb(p.t, 'gagne', 'gagnent') : verb(p.t, 'perd', 'perdent')} ${Math.abs(p.amount)} de coût${durText(p.dur)}`,
  },
  grantKw: {
    label: 'Donner un mot-clé (Initiative, Bloqueur…)', params: [TARGET({ side: 'mine', who: 'chars', n: 1 }),
      { k: 'kw', label: 'Mot-clé', type: 'sel', def: 'blocker', opts: Object.fromEntries(Object.entries(KEYWORDS_AUTO).filter(([k]) => k !== 'unlimited')) }, DUR],
    text: (p) => `${targetText(p.t)} ${verb(p.t, 'gagne', 'gagnent')} [${KEYWORDS_AUTO[p.kw]}]${durText(p.dur)}`,
  },
  donAdd: {
    label: 'Ajouter des DON!!', params: [n('n', 'DON!!'), { k: 'state', label: 'État', type: 'sel', def: 'rested', opts: { rested: 'reposé(s)', active: 'actif(s)' } }],
    text: (p) => `ajoutez jusqu'à ${p.n} DON!! de votre deck DON!! et ${p.state === 'active' ? 'gardez-les actifs' : 'reposez-les'}`,
  },
  donAttach: { label: 'Attacher des DON!! reposés', params: [n('n', 'DON!!'), TARGET({ side: 'mine', who: 'leaderOrChar', n: 1 })], text: (p) => `attachez jusqu'à ${p.n} DON!! reposé${p.n > 1 ? 's' : ''} à ${targetText(p.t)}` },
  donUntap: { label: 'Redresser des DON!!', params: [n('n', 'DON!!')], text: (p) => `redressez jusqu'à ${p.n} de vos DON!!` },
  donOppReturn: { label: 'L\'adversaire renvoie des DON!!', params: [n('n', 'DON!!')], text: (p) => `votre adversaire renvoie ${p.n} DON!! de son terrain dans son deck DON!!` },
  restOppDon: { label: 'Reposer des DON!! adverses', params: [n('n', 'DON!!')], text: (p) => `reposez jusqu'à ${p.n} DON!! de votre adversaire` },
  lifeFromDeck: { label: 'Ajouter le dessus du deck à sa Vie', params: [n('n', 'Cartes'), FACE], text: (p) => `ajoutez${p.face === 'up' ? ' face visible' : ''} au-dessus de votre Vie jusqu'à ${p.n} carte${p.n > 1 ? 's' : ''} du dessus de votre deck` },
  lifeFromHand: { label: 'Ajouter une carte de sa main à sa Vie', params: [n('n', 'Cartes'), FILTER, FACE], text: (p) => `ajoutez${p.face === 'up' ? ' face visible' : ''} au-dessus de votre Vie jusqu'à ${p.n} carte${p.n > 1 ? 's' : ''}${filterText(p.f)} de votre main` },
  lifeToHand: { label: 'Prendre une de ses Vies en main', params: [n('n', 'Vies'), LIFE_POS], text: (p) => `ajoutez à votre main ${p.n} carte${p.n > 1 ? 's' : ''} ${LIFE_POS.opts[p.pos || 'top']} de votre Vie` },
  toLife: {
    label: 'Placer un Personnage dans la Vie de son propriétaire', params: [TARGET({ side: 'opp', who: 'chars', n: 1 }),
      { k: 'pos', label: 'Où', type: 'sel', def: 'top', opts: { top: 'au-dessus', bottom: 'au-dessous' } }, FACE],
    text: (p) => `ajoutez${p.face === 'up' ? ' face visible' : ''} ${p.pos === 'bottom' ? 'au-dessous' : 'au-dessus'} de la Vie de son propriétaire ${targetText(p.t)}`,
  },
  oppLifeRemove: {
    label: 'Retirer une Vie adverse', params: [n('n', 'Vies'), { k: 'to', label: 'Vers', type: 'sel', def: 'trash', opts: { trash: 'sa défausse', hand: 'sa main' } }],
    text: (p) => `placez ${p.n} des Vies de votre adversaire dans ${p.to === 'hand' ? 'sa main' : 'sa défausse'}`,
  },
  lifeLook: { label: 'Regarder et réordonner ses Vies', params: [], text: () => 'regardez toutes vos Vies et replacez-les dans l\'ordre de votre choix' },
  protect: {
    label: 'Ne peut pas être mis KO', params: [TARGET({ side: 'mine', who: 'self', n: 1 }),
      { k: 'by', label: 'Par', type: 'sel', def: 'both', opts: { battle: 'en combat', effect: 'par effet', both: 'en combat ni par effet' } }, DUR],
    text: (p) => `${targetText(p.t)} ${verb(p.t, 'ne peut', 'ne peuvent')} pas être mis KO ${p.by === 'battle' ? 'en combat' : p.by === 'effect' ? 'par des effets' : 'en combat ni par des effets'}${durText(p.dur)}`,
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
  if (f.type) parts.push(f.typeIncl === 'yes' ? `incluant «${f.type}» dans son type` : `de type {${f.type}}`);
  if (f.color) parts.push(f.color);
  if (f.attr) parts.push(`d'attribut ${f.attr}`);

  if (f.cardType) parts.push(`de type ${{ character: 'Personnage', event: 'Événement', stage: 'Lieu', leader: 'Leader' }[f.cardType]}`);
  if (f.maxCost !== undefined && f.maxCost !== '') parts.push(`de coût ${f.maxCost} ou moins`);
  if (f.minCost !== undefined && f.minCost !== '') parts.push(`de coût ${f.minCost} ou plus`);
  if (f.maxPower !== undefined && f.maxPower !== '') parts.push(`de puissance ${f.maxPower} ou moins`);
  if (f.maxBasePower !== undefined && f.maxBasePower !== '') parts.push(`de puissance de base ${f.maxBasePower} ou moins`);
  if (f.rested === 'yes') parts.push('reposé');
  if (f.rested === 'no') parts.push('actif');
  if (f.notName) parts.push(`autre que [${f.notName}]`);
  if (!parts.length) return '';
  return (short ? ' ' : ' ') + parts.join(' ');
}

export function targetText(t = {}) {
  const opp = t.side === 'opp';
  const f = filterText(t.f);
  switch (t.who) {
    case 'self': return 'cette carte';
    case 'selfLeader': return 'ce Leader';
    case 'leader': return opp ? 'le Leader adverse' : 'votre Leader';
    case 'allChars': return opp ? `tous les Personnages adverses${f}` : `tous vos Personnages${f}`;
    case 'leaderAndAll': return opp ? 'le Leader adverse et tous ses Personnages' : 'votre Leader et tous vos Personnages';
    case 'leaderOrChar': return opp ? `le Leader adverse ou jusqu'à ${t.n} Personnage${t.n > 1 ? 's' : ''} adverse${t.n > 1 ? 's' : ''}${f}`
      : `votre Leader ou jusqu'à ${t.n} de vos Personnages${f}`;
    default: return opp ? `jusqu'à ${t.n} Personnage${t.n > 1 ? 's' : ''} adverse${t.n > 1 ? 's' : ''}${f}` : `jusqu'à ${t.n} de vos Personnages${f}`;
  }
}

// ---------- Effets de remplacement ----------
// e.rp = { ev, who } : quel départ du terrain est remplacé, et pour quelle carte.
export const REPLACE_EV = {
  ko: 'mis KO', koBattle: 'mis KO en combat', koOpp: 'mis KO par un effet adverse',
  leaveOpp: 'quitter le terrain à cause d\'un effet adverse', any: 'mis KO ou quitter le terrain à cause d\'un effet adverse',
};
export const REPLACE_WHO = { self: 'ce Personnage', any: 'un de vos Personnages', other: 'un de vos autres Personnages' };
// « Défaussez 1 carte » → « défausser 1 carte » (après « vous pouvez »).
const infinitive = (s) => s.replace(/^(\S+?)ez\b/i, (m, r) => (/^mett$/i.test(r) ? 'mettre' : `${r.toLowerCase()}er`));
function replaceText(e, card) {
  const rp = e.rp || {};
  const who = rp.who === 'self' ? 'ce Personnage' : `un de vos ${rp.who === 'other' ? 'autres ' : ''}Personnages${filterText(e.wf || {})}`;
  const ev = REPLACE_EV[rp.ev || 'ko'];
  const conds = (e.conds || []).filter((c) => CONDS[c.k]).map((c) => CONDS[c.k].text(c).replace(/^Si /, '').replace(/,$/, ''));
  const costs = (e.costs || []).filter((c) => COSTS[c.k]).map((c) => infinitive(c.k === 'restDon' ? `Reposez ${c.n} de vos DON!!`
    : c.k === 'donReturn' ? `Renvoyez ${c.n} DON!! de votre terrain à votre deck DON!!` : COSTS[c.k].text(c)));
  const acts = (e.actions || []).filter((a) => ACTIONS[a.k]).map((a) => infinitive(ACTIONS[a.k].text(a)));
  const instead = [...costs, ...acts].join(' et ') || '…';
  const head = e.once ? '[Une fois par tour] ' : '';
  return `${head}Si ${conds.length ? `${conds.join(' et ')} et que ` : ''}${who} devait être ${ev.replace(/^quitter/, 'amené à quitter')}, vous pouvez ${instead} à la place.`
    .replace('devait être amené à quitter', 'devait quitter');
}

// ---------- Texte d'une carte ----------
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// « Si A, Si B, » → « Si A et que B, »
function joinConds(list) {
  if (list.length < 2 || !list.every((t) => /^S(i |'il )/.test(t))) return list;
  const strip = (t) => t.replace(/,$/, '');
  return [`${[strip(list[0]), ...list.slice(1).map((t) => strip(t).replace(/^Si /, 'que ').replace(/^S'il /, 'qu\'il '))].join(' et ')},`];
}

// card (facultatif) : la carte qui porte l'effet, pour écrire « ce Leader ».
export function effectText(e, card) {
  const w = WHEN[e.when] || {};
  if (w.replace) return replaceText(e, card);
  const tag = w.subject ? `[${w.phrase(e.wf || {})}]` : w.tag;
  const head = [tag, e.once ? '[Une fois par tour]' : ''].filter(Boolean);
  const donCond = (e.conds || []).filter((c) => c.k === 'donAttached').map((c) => CONDS.donAttached.text(c));
  const otherConds = joinConds((e.conds || []).filter((c) => c.k !== 'donAttached' && CONDS[c.k]).map((c) => CONDS[c.k].text(c)));
  const costs = (e.costs || []).filter((c) => COSTS[c.k]).map((c, i) => (i ? COSTS[c.k].text(c).replace(/^\p{Lu}(?!ON!!)/u, (x) => x.toLowerCase()) : COSTS[c.k].text(c)));
  // Un effet permanent n'a pas de durée à écrire.
  const acts = (e.actions || []).filter((a) => ACTIONS[a.k]).map((a) => {
    let x = w.continuous && 'dur' in a ? { ...a, dur: null } : a;
    if (card?.type === 'leader' && x.t?.who === 'self') x = { ...x, t: { ...x.t, who: 'selfLeader' } };
    return ACTIONS[a.k].text(x);
  });
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
  const kws = (card?.keywords || []).filter((k) => k !== 'unlimited').map((k) => `[${KEYWORDS_AUTO[k]}]`).join(' ');
  // Règle de construction de deck, écrite comme sur la carte officielle.
  const unlimited = card?.keywords?.includes('unlimited') ? UNLIMITED_TEXT : '';
  const main = list.filter((e) => e.when !== 'trigger').map((e) => effectText(e, card));
  const trig = list.filter((e) => e.when === 'trigger').map((e) => effectText(e, card));
  return { main: [unlimited, kws, ...main].filter(Boolean).join('\n'), trigger: trig.join(' ') };
}

// Valeurs par défaut d'un bloc (pour l'éditeur).
export function defaults(params) {
  const o = {};
  for (const p of params) o[p.k] = structuredClone(p.def);
  return o;
}
