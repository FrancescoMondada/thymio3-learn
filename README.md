# Thymio · Neurones

Une page web pour **regarder et régler l'apprentissage du Thymio 3**: le mode « réseau de neurones » du
firmware (le mode blanc, `main/ann.c`), où le robot apprend à éviter les obstacles en se cognant. La page
montre le réseau qui apprend, ses 16 poids qui bougent, l'activité des capteurs, des connexions et des
roues, et laisse changer à la main les poids, la vitesse d'apprentissage, la vitesse du robot et l'oubli.

Pensée pour des élèves d'environ 12 ans: du texte, de vrais nombres, un style sobre (sombre ou clair),
alors que [thymio3-cards](../thymio3-cards) vise les plus petits avec des pictogrammes. Même base technique
(React + Vite + `thymio3-ts-api`), mêmes principes pour parler au robot.

**Essayé sans robot seulement** (robot virtuel, faux robot Bluetooth, tests). Pas encore sur un vrai Thymio 3: voir « Statut ».

## Le mode du firmware, tel qu'il est reproduit

Un réseau sans couche cachée: les **7 capteurs de proximité** (5 devant, 2 derrière) et une entrée constante
(le « biais ») sont reliés aux **2 roues**, soit 16 poids.

```
x[i] = lecture[i] / 20         x[7] = 1 (le biais)
roue = (x[0]·w[0] + … + x[6]·w[6] + x[7]·w[7]) / 30
```

Le poids du biais (2000) est la vitesse du robot quand rien n'est devant lui: 2000 / 30 = 66.

- **Avance** (blanc qui pulse): le réseau conduit. Si un capteur avant dépasse **3300**, c'est un choc.
- **Recule** (rouge): 1 s à −200, en mémorisant quels capteurs ont touché.
- **Apprend** (vert, 0,3 s): capteurs de gauche (0, 1) → roue gauche **+pas**, roue droite **−pas**; capteurs de droite (3, 4) →
  l'inverse; capteur du milieu (2) → la roue du côté le moins touché perd un demi-pas. Le pas est 3.
- **Oubli**: toutes les 16 s chaque poids (sauf le biais) se rapproche de 0.
- Boutons du robot: flèche arrière = pause, avant = reprendre, gauche ou droite = geler / reprendre l'apprentissage, centre = quitter.
- Les 16 LED Lego montrent le nombre de leçons, le cercle de LED le niveau des poids.

Les poids du firmware sont des variables C que rien ne permet de lire ni de changer. `src/py/ann_mode.py` est
donc le **même mode réécrit en MicroPython**, qui tourne sur le robot, conduit les moteurs lui-même et
**dit ses poids**. Il s'installe à la place du mode d'origine tant qu'il tourne.

Écarts avec le firmware (voulus):

| Firmware | Ici |
| --- | --- |
| pas 3, vitesse 67 et oubli 16 s fixes | réglables depuis la page (mêmes valeurs au départ) |
| un poids de 0,5 oscille entre +0,5 et −0,5 à chaque oubli (le pas d'oubli est 1) | un poids s'arrête à 0 |
| pas de limite des poids | ±100 (au-delà, un capteur seul dépasse la vitesse maximale) |
| vitesse non limitée | ±500 |
| moteurs donnés toutes les 100 ms | à chaque tick de 20 ms (voir « Moteurs ») |
| rien n'est dit | une ligne `@@n` toutes les 100 ms, `@@w` à chaque changement de poids |

## Ce que montre la page

- **Le robot et son réseau, dans une seule image**: le robot vu de dessus, dessiné d'après les photos du Thymio 3 (nez arrondi,
  côtés droits, une échancrure de chaque côté où se loge la roue, un talon plat), et **le réseau de neurones dedans**. Sur un écran
  large le robot regarde vers la gauche (les roues sont en haut et en bas); sur un écran étroit il regarde vers le haut.
  - **Les 7 capteurs** sont sur son nez, numérotés, remplis par ce qu'ils lisent, chacun avec son **cône**: sa longueur est la distance
    que la lecture représente (`distanceFromProx` dans `src/spec.js`), donc **lecture basse = objet loin = grand cône** (pâle quand il
    ne voit rien), lecture haute = objet près = petit cône marqué; le nombre au bout est la lecture (0 à 4095). Un anneau rouge = choc.
  - **La vitesse de base** (la constante 1) est sur le talon; **les deux neurones « + »** sont dans le corps, chacun à côté de sa roue.
    Un neurone additionne la vitesse de base et ce qu'apporte chaque capteur, et envoie le résultat à **sa roue**: un pneu dont les
    rainures avancent ou reculent à une vitesse **exactement proportionnelle** à celle de la roue, avec le nombre à côté.
  - **16 connexions** relient les capteurs et la base aux neurones, d'autant plus épaisses que leur poids est grand; **bleu** = elle
    accélère la roue, **rouge** = elle freine, les deux finissent par une flèche qui s'arrête un peu avant le neurone; ce qui coule dessus
    est la vitesse que ce capteur ajoute à cette roue à cet instant. Un poids qui change clignote.
    **Le nombre sur un trait est le poids: on le touche et on tape un autre nombre** (Entrée ou un clic ailleurs valide, Échap annule,
    les flèches haut/bas ou − / + font un demi-cran). Il n'y a pas de curseur pour les poids; la vitesse de base se règle avec le curseur
    « vitesse du robot ».
- **Le cerveau** (en haut de la colonne de droite): un interrupteur « Apprentissage » (le robot apprend ou non), tout oublier,
  quatre cerveaux tout faits (vierge, évite, attiré, prudent). Rien n'est enregistré.
- **Ce que fait le robot**: avance → choc, recule → apprend, les leçons retenues (les 16 LED Lego), la règle d'apprentissage.
- **Réglages**: vitesse d'apprentissage, vitesse du robot, oubli (jamais ou toutes les n s), pause.
- **Les signaux au fil du temps**: une pile de graphiques qui ont **le même axe du temps et les mêmes marges**, donc alignés de haut
  en bas (ce qui se passe au même instant est sur la même verticale): les lectures des capteurs (avec le seuil de choc), les poids
  vers la roue gauche, les poids vers la roue droite, la vitesse des roues. Chaque graphique se cache avec son œil, et on choisit les
  signaux à comparer (capteurs 1 à 7, roue gauche, roue droite; « Tous » / « Aucun »). Une marque rouge sur tous les graphiques est un
  choc; un seul curseur traverse la pile. Durée: 30 s, 1, 5 ou 15 min (le robot garde 15 min de lectures); vue tableau des poids.
- **Robot virtuel** ou **robot réel** (bouton en haut): le virtuel est une arène où l'on **glisse les obstacles**, avec un temps
  accéléré (×1 à ×10); le réel remplace l'arène par le robot et sa batterie.
- **Paramètres** (la roue dentée en haut à gauche, ou la touche D): **la langue** (italien, français, allemand, anglais; la langue du navigateur
  est prise si c'est l'une des quatre), le thème, et tout l'ancien diagnostic: la liaison avec le robot, le journal de la liaison, le test
  de la liaison, le programme du robot, les raccourcis. (Le panneau des curseurs s'appelle « Réglages »; en anglais « Controls ».)

Clavier: Espace = pause, G = geler, 0 = tout oublier, D = paramètres.

## Comment ça marche avec un vrai robot

```
 page  ──(Bluetooth: commande des actionneurs = les 4 LED du corps)──▶  mode sur le robot (ann_xxxxxxxx.py)
 page  ◀─(stdout: lignes "@@…" de 100 octets)──────────────────────────  il dit ses lectures et ses poids
```

Comme dans thymio3-cards: un script qui tourne ne peut rien recevoir par les services Python et fichiers du Bluetooth (ils sont
servis par la tâche qui l'exécute). Le seul chemin vers lui est la **commande des actionneurs**, que le firmware traite
toutes les 20 ms et qui écrit les LED du corps; MicroPython **relit** ces LED (`LEDS_RGB(i).get_intensity_*`).

- **Installation**: le mode (10,6 Ko une fois réduit) est envoyé **une seule fois** comme module (`ann_<hash>.py`, ≈ 4 s);
  un démarrage est ensuite un script de deux lignes, `import ann_x; ann_x.run(30, 667, 16, "")`, dont les arguments portent le
  pas, la vitesse, l'oubli et les 14 poids de départ. Sans module, le mode entier est envoyé.
- **Robot → page** (`parseRobotLine` dans `src/protocol.js`):
  `@@n état p0..p6 gauche droite leçons` toutes les 100 ms; `@@w` (14 poids, en dixièmes) à chaque changement et toutes les 3 s;
  `@@p pas vitesse oubli`; `@@hit masque` (quels capteurs ont touché); `@@learn n`; `@@forget n`; `@@ack n`; `@@state`, `@@exit`, `@@bye`.
- **Page → robot**: un message est une suite d'objets (clé + valeur de 12 bits: un poids en dixièmes, le pas, la vitesse,
  l'oubli, une commande: tout oublier / pause / reprendre / geler / apprendre / quitter), écrite dans les LED en 1 à 8 trames de douze valeurs de 4 bits
  (numéro de message, marqueur à 15, numéro de trame, huit demi-octets, somme de contrôle). Le mode répond `@@ack n`. Un curseur
  qu'on glisse envoie peu de messages: les changements rapprochés sont fusionnés. Un message sans réponse en 0,8 s est renvoyé
  une fois; sinon le mode est **relancé avec le changement**, à partir des derniers poids qu'il a dits (rien n'est perdu).
- **Moteurs**: la commande des actionneurs règle aussi les roues (`SetMotorTargets` dans `ble_spp.c`): chaque message mettrait le
  robot en mouvement à l'arrêt pour un instant. Les trames portent donc les vitesses que le robot vient de dire (`@@n`), et le
  mode redonne les siennes à chaque tick.
- **Lumières**: le canal de réception est le vert de la LED avant gauche (jamais à 15 dans les lumières du mode). Un message fait
  clignoter le corps du robot ≤ 20 ms, et le cercle et les LED Lego sont redessinés au tick suivant.

## Le robot virtuel

`src/sim/arena.js` (une arène, des obstacles, un robot rond à deux roues, sept capteurs dont la lecture suit une courbe qui ressemble
aux vrais: ≈ 4000 au contact, 3300 à 16 mm, rien à 11 cm), `src/sim/ann-mode.js` (le **mode, réécrit en JavaScript**, tick par tick),
`src/sim/virtual-robot.js`, `src/sim/sim-backend.js`. Il produit les mêmes événements que le vrai robot et reçoit les
changements par les mêmes messages (les mêmes trames).

`?fakerobot` dans l'adresse remplace Bluetooth et le robot par un **faux robot** (`src/dev/fake-thymio.js`, même interface que
`thymio3-ts-api`: téléversement du module, lanceur, trames, arrêt…): toute la liaison s'essaie dans un navigateur sans matériel.
`window.fakeRobot.step(n)` fait avancer ce robot de n ticks d'un coup, `window.fakeRobot.flags.live = 'drop'` perd les trames.
(En développement, `window.__learn` donne le magasin et le robot virtuel à la console.)

## Lancer, tester, déployer

```bash
npm install          # l'API Thymio vient de GitHub: github:Mobsya/thymio3-ts-api#main
npm run dev          # http://localhost:5173 (Web Bluetooth demande https ou localhost: Chrome, Edge, Bluefy sur iPhone)
npm test             # JavaScript (node --test), liaison, Python
npm run golden       # réécrit tests/golden-ann.json si le mode Python change
npm run build
```

`.github/workflows/deploy.yml` publie sur GitHub Pages comme les autres projets (pas encore de dépôt).

## Statut — à lire

**Jamais essayé sur un vrai robot.** Vérifié sans robot:

- `tests/test_ann_mode.py` fait tourner **le vrai script Python** sur un robot virtuel (tests/fake_ann_robot.py): mur de face
  (choc, recul de 0,9 à 1 s, leçon, poids), obstacle à gauche ou à droite, capteurs arrière sans choc, oubli (jamais sous 0), vitesse et
  limites, messages de l'interface (poids, réglages, commandes, trames perdues ou fausses, douze objets en huit trames),
  boutons, sortie, lumières (le canal des messages n'est jamais à 15).
- `tests/ann.test.js`: le **port JavaScript fait exactement ce que fait le Python**, tick par tick, sur deux scénarios de 60 s
  (chocs au hasard, boutons, messages): mêmes lignes, mêmes sons, mêmes vitesses.
- `tests/protocol.test.js`: lignes, trames (aller-retour, sommes), objets; le mode **réduit** tel qu'il est envoyé fait la même chose que la source.
- `tests/link.test.js`: la liaison complète (connexion, module installé une fois, lanceur, changements, commandes, curseur glissé,
  trames perdues → relance sans perte) contre le faux robot Bluetooth.
- `tests/arena.test.js`, `tests/store.test.js` (et les textes: aucune clé de langue manquante).
- La page a été regardée dans un navigateur (ordinateur, 375 × 812, 360 × 640, 844 × 390; clair et sombre; robot virtuel et faux robot).

**Pas vérifié, à regarder avec un vrai robot:**

- le débit de la sortie: une ligne de 100 octets toutes les 100 ms, plus les lignes de poids. Le firmware envoie stdout par paquets de
  100 octets; si la liaison peine, la boucle du mode ralentit sans s'arrêter, mais la page serait moins fluide;
- les changements pendant que le robot roule (les trames portent les vitesses courantes; un à-coup des roues serait visible);
- que la courbe des capteurs du robot virtuel ressemble assez aux vrais (elle est de moi, pas mesurée); le seuil de 3300 est celui du firmware;
- que le réseau apprenne utilement dans une vraie pièce (la règle est celle du firmware: elle peut aussi pousser les poids latéraux très haut
  dans une arène étroite, comme on le voit dans le robot virtuel, et le robot n'évite pas toujours mieux après);
- Safari et l'iPhone (il faut Bluefy pour le Bluetooth Web), l'iPad;
- les langues: seulement le français et l'anglais (un dictionnaire de plus suffit pour une autre, `src/i18n.js`).

## Organisation

| Fichier | Rôle |
| --- | --- |
| `src/py/ann_mode.py` | Le mode d'apprentissage en MicroPython, qui tourne sur le robot |
| `src/spec.js` | Capteurs, constantes du firmware, plages des curseurs, cerveaux tout faits |
| `src/protocol.js` | Lignes `@@`, trames dans les LED, objets des messages |
| `src/script.js`, `src/script-core.js` | Le mode comme module (réduit, nom à base de hash) |
| `src/robot/robot-backend-core.js`, `robot-backend.js` | Liaison Web Bluetooth: file d'opérations, module, lanceur, messages, acquittement, repli, journal |
| `src/sim/*` | Arène, mode en JavaScript, robot virtuel |
| `src/dev/fake-thymio.js`, `src/api.js` | Faux robot Bluetooth (`?fakerobot`); `api.js` choisit le vrai ou le faux |
| `src/store.js` | Ce que la page sait du robot et son historique |
| `src/App.jsx` | État, robot virtuel ou réel, clavier, mise en page (onglets sur écran étroit) |
| `src/components/Network.jsx`, `RobotTop.jsx` | Le schéma du réseau et le robot vu de dessus |
| `src/components/WeightChart.jsx`, `Activity.jsx`, `chartkit.js` | Les poids au fil du temps, les capteurs et les roues |
| `src/components/Controls.jsx`, `WeightEditor.jsx`, `Slider.jsx`, `CycleStrip.jsx` | Réglages, tableau et réglage des poids, cycle du robot |
| `src/components/Arena.jsx`, `RealPanel.jsx`, `Diagnostics.jsx`, `Help.jsx` | Arène, robot réel, diagnostic, aide |
| `src/i18n.js`, `src/styles.css` | Textes (FR, EN) et style (couleurs en jetons, clair et sombre) |
| `tests/` | `node --test`, liaison, Python (`test_ann_mode.py`, `fake_ann_robot.py`) |
