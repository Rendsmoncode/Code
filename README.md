# OPTCG Maison

Simulateur de jeu de cartes **dans le navigateur**, avec les règles du One Piece Card Game, mais avec **vos propres cartes**.

## Les 3 onglets

- **Cartes** : créez vos cartes (Leader, Personnage, Événement, Lieu) : nom, couleurs, coût, vie, puissance, contre, attribut, types, effet, déclencheur et image. L'aperçu se met à jour en direct. Le bouton *Exporter* sauvegarde toute la collection dans un fichier, et *Importer* la recharge (sur un autre ordinateur, par exemple).
- **Decks** : 1 Leader et exactement **50 cartes**, 4 exemplaires maximum par numéro, aux couleurs du Leader. Un deck exporté contient aussi ses cartes : votre ami n'a qu'à l'importer.
- **Jouer** : du 1v1 en ligne. L'un clique sur *Créer une partie* et envoie le code (ou le lien) ; l'autre clique sur *Rejoindre*.

## Déroulement d'une partie

1. Tirage au sort : le gagnant choisit de jouer en premier ou en second.
2. 5 cartes en main, mulligan possible une fois, puis les cartes Vie sont posées selon la Vie du Leader.
3. Chaque tour se fait automatiquement : rafraîchissement, pioche (sauf au 1er tour du premier joueur), +2 DON!! (+1 au tout premier tour).
4. Cliquez sur une carte, une pile ou la zone DON!! pour ouvrir son menu d'actions : jouer, attacher un DON!!, attaquer, reposer, défausser, chercher dans le deck, etc.
5. Combat : l'attaquant choisit sa cible (le Leader ou un Personnage reposé). Le défenseur peut bloquer avec un `[Bloqueur]` et contrer avec les cartes de sa main, puis il valide. Les dégâts, les KO, la `[Double attaque]`, l'`[Exil]` et les `[Déclenchement]` sont gérés.
6. On perd quand son Leader est touché sans Vie restante, quand son deck est vide, ou en abandonnant.

Les effets des cartes se résolvent à la main, comme sur une vraie table : les menus permettent tous les déplacements de cartes et les bonus de puissance.

## Tester seul

Dans *Jouer*, ouvrez « Tester seul », cochez *Mode local*, créez une partie, puis ouvrez le lien dans un second onglet.

## Technique

Le site est fait de fichiers statiques : HTML, CSS et JavaScript, sans installation. Les cartes et les decks sont enregistrés dans le navigateur (IndexedDB). La connexion entre joueurs est directe, de navigateur à navigateur, avec [PeerJS](https://peerjs.com/).

Pour ouvrir le site sur votre ordinateur, double-cliquez sur `index.html`.

Le code source est dans `js/`. Le fichier `app.js` à la racine est généré à partir de ce dossier avec `npm run build` : relancez cette commande après chaque modification de `js/`.
