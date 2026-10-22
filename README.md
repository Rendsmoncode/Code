# OPTCG Maison

Simulateur de jeu de cartes **dans le navigateur**, avec les règles du One Piece Card Game, mais avec **vos propres cartes**.

## Comptes et boosters

Les comptes se créent **sur invitation** : dans l'onglet *Admin*, l'organisateur crée pour chaque ami un lien personnel (valable une fois) qui réserve son pseudo et lui donne son deck de départ et ses boosters ; l'ami n'a plus qu'à choisir son mot de passe. Sans deck attribué, le joueur choisit un **deck préconstruit** à sa première connexion, puis il agrandit sa collection en ouvrant des **boosters** :

- 1 booster gratuit toutes les 10 minutes (6 en réserve au maximum), plus les boosters offerts par les admins ;
- 5 cartes par booster : 3 Communes, 1 Peu commune, puis 1 carte Rare ou mieux (1 Super rare tous les 4 boosters, 1 Ultra rare tous les 15, 1 Légendaire tous les 50, 1 « 1on1 » tous les 500) ;
- une carte « 1on1 » n'existe qu'en un seul exemplaire dans tout le jeu ;
- le tirage se fait sur le serveur : impossible de tricher.

Un deck ne peut contenir que des cartes que l'on possède. Le **premier compte créé** devient propriétaire du jeu : il peut créer les cartes, nommer des admins et distribuer des boosters (onglets *Cartes* et *Admin*).

Les données sont stockées sur [Supabase](https://supabase.com). Les images des cartes sont privées : seuls les joueurs connectés les voient, grâce à des adresses temporaires. Le script `supabase/setup.sql` crée les tables et les règles de sécurité ; il faut le lancer une fois dans *SQL Editor*.

## Les onglets

- **Boosters** : ouverture des boosters, carte par carte.
- **Collection** : toutes les cartes du jeu, celles qu'on possède en couleur.
- **Cartes** (admins) : créez les cartes (Leader, Personnage, Événement, Lieu) : nom, couleurs, coût, vie, puissance, contre, attribut, types, effet, déclencheur et image. L'aperçu se met à jour en direct. Le bouton *Exporter* sauvegarde toute la collection dans un fichier, et *Importer* la recharge (sur un autre ordinateur, par exemple).
- **Decks** : 1 Leader et exactement **50 cartes** que l'on possède, 4 exemplaires maximum par numéro, aux couleurs du Leader.
- **Admin** (admins) : distribuer des boosters (à un joueur ou à tous), nommer des admins (propriétaire uniquement), créer les decks préconstruits.
- **Jouer** : du 1v1 en ligne. L'un clique sur *Créer une partie* et envoie le code (ou le lien) ; l'autre clique sur *Rejoindre*.

## Déroulement d'une partie

1. Tirage au sort : le gagnant choisit de jouer en premier ou en second.
2. 5 cartes en main, mulligan possible une fois, puis les cartes Vie sont posées selon la Vie du Leader.
3. Chaque tour se fait automatiquement : rafraîchissement, pioche (sauf au 1er tour du premier joueur), +2 DON!! (+1 au tout premier tour).
4. Cliquez sur une carte, une pile ou la zone DON!! pour ouvrir son menu d'actions : jouer, attacher un DON!!, attaquer, reposer, défausser, chercher dans le deck, etc.
5. Combat : l'attaquant choisit sa cible (le Leader ou un Personnage reposé). Le défenseur peut bloquer avec un `[Bloqueur]` et contrer avec les cartes de sa main, puis il valide. Les dégâts, les KO, la `[Double attaque]`, l'`[Exil]` et les `[Déclenchement]` sont gérés.
6. On perd quand son Leader est touché sans Vie restante, quand son deck est vide, ou en abandonnant.

## Effets des cartes

Les effets se construisent dans l'éditeur avec des menus déroulants (fichier `js/effects.js`) :
**Quand** (Jouée, Attaque, Bloquée, KO, Activation : Principale, Contre, Déclenchement, début/fin de tour, effets permanents…)
→ **Conditions** (DON!! attachés, Vies, type du Leader…) → **Coûts** (reposer des DON!!, défausser…) → **Actions**
(piocher, défausser, regarder le dessus du deck, jouer gratuitement, mettre KO, renvoyer en main, puissance +/−, DON!!, Vie, protection…).
Le texte de la carte s'écrit tout seul et le jeu applique l'effet pendant la partie, y compris sur les cartes de l'adversaire.

Un effet impossible à décrire ainsi s'écrit en **texte libre** : il se résout à la main grâce au bouton « Effet manuel ».
Hors de ce mode, les actions libres (piocher, chercher dans le deck, défausser…) sont verrouillées ; pendant ce mode,
chaque action s'affiche en rouge chez l'adversaire, qui peut **contester** pour tout annuler.

## Reprise d'une partie

La partie est sauvegardée en continu dans le navigateur. Si un joueur recharge sa page ou perd sa connexion, l'onglet *Jouer* lui propose de **reprendre la partie** ; l'invité se reconnecte aussi tout seul après une coupure.

## Tester seul

Dans *Jouer*, ouvrez « Tester seul », cochez *Mode local*, créez une partie, puis ouvrez le lien dans un second onglet.

## Technique

Le site est fait de fichiers statiques : HTML, CSS et JavaScript, sans installation. Les cartes, collections et decks sont enregistrés sur Supabase. La connexion entre joueurs est directe, de navigateur à navigateur, avec [PeerJS](https://peerjs.com/).

Pour ouvrir le site sur votre ordinateur, double-cliquez sur `index.html`.

Le code source est dans `js/`. Le fichier `app.js` à la racine est généré à partir de ce dossier avec `npm run build` : relancez cette commande après chaque modification de `js/`.

## Tests

`npm test` lance des parties automatiques à deux onglets, avec un faux serveur Supabase : chaque action, coût, condition et déclencheur d'effet ; une partie avec attaque, blocage et Contre ; le déroulement complet (Déclenchement depuis la Vie, victoire, revanche, deck vide) ; la reprise d'une partie après le rechargement d'une page. Il faut d'abord installer les outils : `npm install` puis `npx playwright install chromium`.
