# Classe Parallèle — dossier complet du projet

*Document destiné à être lu par une personne ou un modèle qui découvre le projet.
Il décrit ce qu'est le site, pourquoi il est fait ainsi, ce qui existe
aujourd'hui, et ce qui ne va pas.*

---

## 1. Ce que c'est, en une phrase

**Classe Parallèle** est une école numérique qui tourne **à côté** d'un serveur
Roblox de jeu de rôle inspiré de *L'Attaque des Titans*. Roblox reste le jeu et
le lieu du RolePlay ; le site prend en charge toute la pédagogie — cours,
cahiers, tableau, exercices, notes, archives.

```
ROBLOX                         CLASSE PARALLÈLE
le corps, la scène, le RP  ←→  les cours, les cahiers, le tableau, les notes
```

**Ce que le projet s'interdit formellement**, depuis le premier jour :

- aucune injection de code dans Roblox ;
- aucun exploit, aucun contournement du jeu ;
- aucune fausse intégration native — le site ne prétend jamais savoir ce qui
  se passe dans Roblox.

Cette dernière règle a une conséquence de conception qu'il faut comprendre pour
comprendre tout le reste : **quand une action suppose une présence physique
dans le jeu, c'est un humain qui l'atteste, jamais le logiciel qui la devine.**
Le site demande « attestez-vous être à côté de lui ? » et enregistre la
réponse. Il ne la vérifie pas, parce qu'il ne le peut pas, et il ne fait pas
semblant de le pouvoir.

**Registre visuel voulu** : premium, militaire, scolaire, RP. Encre, laiton,
olive, parchemin. Explicitement **pas** un tableau de bord SaaS.

---

## 2. Pile technique

| | |
|---|---|
| **Front** | HTML, CSS et **modules ES natifs**. Aucun framework, aucune étape de construction. |
| **Base** | **Supabase** — PostgreSQL, RLS, Realtime, Storage. |
| **Second pilote** | **Mode démonstration** — localStorage + IndexedDB + BroadcastChannel. Aucun serveur. |
| **Hébergement** | Netlify, site statique. Dépôt GitHub `karambasaho24-eng/Html-site`. |
| **Taille** | ~18 000 lignes de JS/CSS, ~2 900 lignes de SQL, 17 migrations. |

### Les deux pilotes de données

C'est la décision structurante du projet. Tout l'accès aux données passe par
une interface unique (`src/data/contrat.js`), implémentée deux fois :

- `src/data/supabase.js` — le vrai service ;
- `src/data/local.js` — tout dans le navigateur, sans compte ni réseau.

Conséquence pratique : **le site fonctionne entièrement hors ligne**, et deux
onglets du même poste peuvent jouer le professeur et l'élève. C'est ce qui
permet de tester une scène à deux rôles sans deux machines.

Conséquence à connaître : le pilote local **n'offre aucune sécurité réelle**.
Il n'y a ni RLS ni vérification côté serveur. Il sert à jouer et à essayer,
jamais à héberger des données réelles.

### Sécurité

Toute la sécurité repose sur les **politiques RLS** de PostgreSQL, jamais sur
l'interface. Les fonctions d'aide sont en `SECURITY DEFINER` :
`app_is_member`, `app_is_staff`, `app_is_staff_of`, `app_is_moderator`,
`app_can_read_notebook`, `app_can_write_notebook`…

Les masquages de l'interface (`src/core/permissions.js`) sont **décoratifs** :
ils cachent ce qui n'est pas permis, ils ne le protègent pas. Le commentaire en
tête du fichier le dit explicitement pour qu'on ne s'y trompe pas.

---

## 3. Le vocabulaire

Le site parle le langage d'une académie militaire, pas celui d'un logiciel.
Un fichier de lexique (`src/core/lexique.js`) permet de changer les mots selon
l'univers choisi. On dit **cadet** et **maître**, on **boucle** un sac, on
**tend** un papier, on **porte** une note, on **prive** de matériel.

Le code lui-même est écrit en français — noms de variables, de fonctions et
commentaires. Les commentaires expliquent **pourquoi**, rarement **quoi**.

---

## 4. Ce qui existe aujourd'hui

### 4.1 La classe et la séance

- **Classes** avec code d'entrée à six caractères. Entrée directe : qui tient
  le code entre. (La validation manuelle existe encore dans les réglages, mais
  n'est plus proposée à la création — elle bloquait les élèves sans que le
  professeur s'en aperçoive.)
- **Séances en direct** avec présence temps réel, mains levées, questions,
  sondages, minuterie, annonces, appel.
- **Trois modes de séance** — *Cours*, *Réunion*, *Distribution* — qui ouvrent
  ou ferment des outils (`src/features/modes.js`). Une réunion n'a pas besoin
  d'un cartable ; une distribution n'a pas besoin d'un tableau.
- **Renvoi de séance** avec motif, porté au registre.

### 4.2 Le tableau

Tableau collaboratif temps réel : crayon, formes, texte, gomme, plusieurs
pages, fonds (ardoise, craie, papier, quadrillé), curseurs des autres
participants visibles, capture d'une page vers un cahier.

Le tableau se **taille sur la place disponible** en gardant ses proportions
16:9, avec un plancher de 420 px sous lequel la scène défile. Sans cela, sur un
écran bas, il passait sous le bord et rien ne permettait de le faire défiler.

### 4.3 Les cahiers

- Quatre supports : **feuille, cahier, carnet, dossier**, chacun avec une
  capacité de pages différente.
- Six couvertures : parchemin, cuir, ardoise, olive, bordeaux, encre.
- Éditeur riche : texte, titres, listes, citations, images, pense-bêtes
  déplaçables, dessin.
- **Cahier commun** de classe, collaboratif.
- **Mon cahier en séance** : le cadet écrit dans **le sien**, choisi parmi ceux
  qu'il a dans son sac — et seulement ceux-là.

### 4.4 Les affaires — le cœur du jeu d'objets

C'est le système le plus travaillé, et celui qui porte l'immersion.

**Un objet existe à un seul endroit.** Longtemps, « avoir une plume » était une
chaîne de caractères dans un tableau : `class_bags.supplies` contenait le mot
« Plume ». On pouvait donc l'avoir dans deux classes à la fois, la prêter sans
s'en séparer, et la perdre n'avait aucun sens puisqu'elle n'existait pas. Un
objet est désormais une **ligne qui appartient à quelqu'un et qui se trouve
quelque part** (`belongings`) : c'est tout ce qu'il faut pour que poser, ranger,
emporter, tendre, prêter, rendre, oublier et confisquer cessent d'être des cases
à cocher.

Deux tables, deux questions différentes :

- `belongings` — ce que je possède, et où c'est ;
- `class_bags` — ce que j'ai **déclaré** emporter à telle classe. C'est elle qui
  porte la frontière de confidentialité, et on n'y a pas touché.

Le site ne prétend pas savoir ce qu'un joueur a réellement en main dans Roblox :
il sait ce qu'il a déclaré, et il ne dit rien de plus.

**Les contenants sont des objets.** La plume est dans la trousse, la trousse est
dans le cartable, le cartable est sur l'épaule. Cartable, sacoche, musette,
mallette, trousse, étui, boîte, chemise : on porte ce qu'on veut, et le contenu
suit son contenant.

**L'établi.** Deux plateaux : *chez moi* et *sur moi*. On ouvre un contenant, on
clique un objet, il **traverse physiquement** — technique FLIP : on relève sa
position avant, on le déplace dans le DOM, on le renvoie optiquement à son point
de départ, le navigateur interpole. C'est bien le même nœud qui vole, pas une
copie qui s'allume ailleurs. *Un inventaire où les choses se téléportent n'est
pas un sac, c'est un formulaire à cases.*

**Les kits** sont des raccourcis, jamais des obligations : « Mathématiques »
ajoute ce qu'il faut, il ne vide rien, et on corrige à la main ensuite.

**S'équiper à chaque séance.** Le chargement du sac est **permanent** — on ne
refait pas son cartable chaque matin. Mais on **repose la main dessus** avant
d'entrer : une colonne retient la séance pour laquelle il a été confirmé. Un sac
non repris vaut un sac vide, et l'estrade distingue « il a oublié sa plume » de
« il n'a pas repris ses affaires ».

**Le matériel demandé, à trois degrés.** *Obligatoire* — le manque se joue.
*Recommandé* — on le signale. *Facultatif* — aucune alerte. La consigne se pose
pour **une séance** d'abord, pour la classe ensuite : une demande du jour ne doit
pas réécrire ce qu'on avait demandé le mois dernier. L'encadrement y déclare
aussi **son propre** matériel : même logique des deux côtés de l'estrade.

**La privation.** Si le maître l'a activée : sans support ni de quoi écrire, le
cadet **assiste au cours sans pouvoir rien noter** — tableau verrouillé, cahier
en lecture seule. Deux garde-fous, parce qu'une sanction automatique n'est pas
une scène :

1. elle **tombe d'elle-même** à l'échéance (5 à 30 minutes, au choix) ;
2. le maître **seul** accorde d'aller chercher ce qu'on a laissé.

Lever la main n'affranchit pas. Un refus laisse le temps courir. Et la privation
n'est décidée qu'**après** que le cadet a eu l'occasion de s'équiper — sinon on
le punirait d'un geste que l'application ne lui a pas encore proposé.

**L'encre.** C'est la seule consommation automatique du site, et elle est
volontairement lente : un pour cent tous les 350 caractères, soit plusieurs
séances pleines pour vider un encrier. Le but n'est pas de rendre l'écriture
pénible — c'est de donner une raison de vérifier son matériel avant d'entrer, et
de faire exister la scène du cadet qui demande de l'encre à son voisin. À sec, la
plume ne trace plus ; le geste qui répare (remplir au flacon, en demander) est
juste à côté du message. Ce qui entre dans l'encrier **sort du flacon** : sans
cela l'encre se créerait toute seule et l'objet ne pèserait plus rien. Un crayon,
lui, écrit toujours — c'est voulu : la privation doit se justifier d'un mot.

**Perdre, retrouver, confisquer.** Un objet peut être noté perdu puis retrouvé.
L'encadrement peut en **confisquer** un — jamais automatiquement : c'est un geste
d'autorité, prononcé dans la scène puis porté ici, et la base ne l'accepte que
sur un objet qui a été **apporté**. Il reste au cadet, mais il n'en dispose plus,
et il sait qui l'a et pourquoi.

**Le cartable comme frontière de confidentialité.** Un support apporté peut être
inspecté par l'encadrement ; un support resté chez soi ne le peut pas. Ce n'est
pas du décor, c'est la limite de ce qui est atteignable, et elle est appliquée
par la RLS et par les procédures, pas par l'interface.

**Trente-sept objets dessinés**, tous issus du même générateur
(`outils/dessiner-objets.mjs`) : même plaque sombre, même lumière venue du
haut-gauche, même ombre de contact, mêmes matières — cuir fauve, toile huilée
olive, laiton terni, buis, acier, papier jauni, encre. En SVG parce qu'ils
s'affichent entre 18 et 30 px : à cette taille une photographie devient une tache
brune, c'est la silhouette qui porte la reconnaissance. C'est aussi pourquoi la
plume et le crayon ne se ressemblent pas — deux bâtonnets diagonaux auraient été
indistinguables.

L'instrument de calcul est une **règle à calcul** (et un boulier en second) :
réglette coulissante, curseur, graduations. Aucun écran, aucune pile — rien qui
n'existerait pas dans cet univers.

### 4.4 bis Les objets conditionnent les actions (migration 0019)

Posséder ne suffit pas : il faut avoir l'objet **devant soi**.

- **Lieu** de chaque objet et cahier : `range` (chez soi ou dans un contenant), `bureau` (sorti pendant une activité), `salle` (laissé derrière soi). `src/features/portee.js` répond à « où est-il, pour moi, maintenant ? » et « puis-je faire ceci ? ».
- **Actions et outils** : écrire → crayon / plume / stylo-plume (+ encrier) ; effacer → gomme ; tracer → règle, équerre, compas ; calculer → règle à calcul, boulier ; tableau (professeur) → craie. Sans l'outil, rien ne s'écrit : le cahier se verrouille avec « Vous n'avez aucun outil d'écriture ».
- **Bureau de séance** (`src/features/bureau.js`) : on ouvre son sac et on sort ce qu'on veut. En séance, seul ce qui est sur le bureau sert. En quittant la salle ou à la fin de la séance, ce qui est resté sur le bureau reste **dans la salle**.
- **Contenance** : chaque contenant a une capacité, chaque objet un volume (petit, moyen, encombrant). L'établi affiche `occupé/capacité` et refuse ce qui ne rentre pas ; les cahiers se rangent dans un contenant comme le reste.
- **Oublis** : « Mes affaires » affiche la section *Laissé ailleurs* (❌ indisponible, 📍 dernière position). Récupérer exige que la salle soit ouverte (séance en cours, ouverture par l'encadrement, laissez-passer) et une attestation de présence. Un cahier oublié ne s'ouvre pas.
- **Encadrement** : menu *Objets trouvés* (classe et salle) → autoriser l'accès 30 min, laisser entrer une personne 20 min, restituer un objet. Rien ne revient tout seul.
- **Professeur** : reçoit une fois une sacoche avec craie, crayon, gomme, feuilles et un dossier de professeur — pas « tous les objets ».
- **Dossiers** : onglet *Dossiers* de la sacoche. Un dossier est un objet nommé par le joueur ; on y classe des papiers ; oublié, il n'est plus accessible, ni son contenu.

### 4.4 ter La scène : le bureau devant soi (la salle, depuis le 27 septembre)

La salle ne s'ouvre plus sur une interface de site mais sur **ce que le personnage a devant lui** (`src/features/scene-bureau.js`, `styles/scene.css`) :

- au fond, le **tableau** (le vrai tableau de la séance, vivant, en petit — un clic l'agrandit) et l'**estrade** : le professeur déclare « Je suis devant la classe » d'un geste, les élèves le voient aussitôt (colonne `class_sessions.estrade`, migration 0020) ;
- le **pupitre** en perspective, les affaires posées dessus en photo détourée, avec ombre et biais ; on les déplace à la main (la place est retenue), on les renvoie au sac en les glissant dessus ;
- le **sac** par terre : fermé, puis ouvert sur son intérieur (une poche par contenant) ; un clic sur un objet le fait voler jusqu'au bureau ;
- le **cahier** s'ouvre en livre sur le bureau ; un rail « à portée de main » montre les outils posés. **On écrit seulement avec un outil EN MAIN** : sinon « Aucun outil d'écriture disponible » ou « Prenez votre crayon ».
- le **dock** en bas : sac, cahier, stylo, note, reçus, document, dossiers, tableau, main levée, personnes — des objets, pas des menus.
- **note rapide** (`src/features/note-rapide.js`) : écrire → toucher la personne → tendre. Il faut un outil et une feuille sur le bureau ; la feuille quitte la pile. Le destinataire voit « 📄 Une note vous a été remise. »
- **fenêtres** : compacte (le dock seul), bureau, cahier, sac, document, étendue (l'ancienne interface complète). Le bouton « détacher » pose la fenêtre au-dessus de Roblox (Document Picture-in-Picture, Chrome/Edge).

### 4.4 quater L'application autour du bureau (voir docs/INTERFACE.md)

- **Plus de tableau de bord.** Une ligne de contexte en haut (où je suis, présence du responsable, `👥 n`, notifications, « au-dessus du jeu », ⋯) ; la vue ; la **barre des gestes** en bas : Bureau · Sac · Cahier · Note · Documents · Personnes. Le reste (espaces, cahiers, archives, encadrement, réglages) est dans le tiroir ⋯.
- **Chez moi** remplace l'accueil : le même pupitre que la salle, dans la chambre ; le sac à côté ; au mur, une plaque encadrée d'argent avec ce qui se passe en ce moment (séance ouverte → « Y aller », papiers remis, notifications, rejoindre un espace). On prépare son sac physiquement.
- **La taille décide du comportement** (`chassis[data-taille]` : grand / moyen / compact / mini). En compact et mini — dont la fenêtre posée au-dessus de Roblox —, la scène laisse place à la **console** (`src/features/console.js`) : un panneau à la fois (bureau, sac, cahier, note, documents, personnes ; en salle aussi tableau et ⋯), la barre en dessous ; en mini, le panneau s'ouvre par-dessus.
- **Personnes** : pictogrammes et noms sur une bande défilante (`src/features/personnes.js`), jamais de gros profils. **Présence** : une pastille « ● Professeur présent / ○ absent » — le mot dépend du contexte (président de séance, chef de mission, hôte…).
- **Contextes** : cours, réunion, mission, entretien, distribution (migration 0021).
- **Design** : graphite, argent brossé pour les commandes et les cadres, bois et papier pour les objets.

### 4.5 Les objets qui circulent

**Le principe, partout le même : un objet n'est jamais à deux endroits.**
Donner le fait changer de propriétaire ; prêter le laisse à son propriétaire mais
le met dans les mains d'un autre ; rendre le ramène ; refuser ne déplace rien.
Le transfert est fait par la base — c'est le seul endroit où un objet bouge —
parce qu'une vérification côté écran n'empêche personne de rien.

- **Tendre un objet.** On choisit qui, on choisit le geste (prêter ou donner),
  on atteste la proximité, l'autre accepte ou refuse. *Un objet qui atterrit
  dans les mains de quelqu'un sans qu'il ait dit oui n'est pas un don, c'est un
  dépôt.*
- **Demander un objet.** Le même transfert vu de l'autre bout : on demande *une*
  règle, pas *cette* règle-là, et c'est le propriétaire qui choisit laquelle il
  sort de son sac.
- **Rendre.** Un prêt se rend, des deux côtés : l'emprunteur rend, ou le prêteur
  reprend. Un don, lui, ne se reprend pas — il faut le redemander.
- **Pas de duplication.** Un index unique partiel interdit qu'un objet parte deux
  fois : tant qu'une remise est offerte ou acceptée, aucune autre ne peut naître.
- **Les papiers.** Cinq modèles avec leurs mises en page propres : mot, ordre de
  mission, convocation, laissez-passer, rapport. Cachet de cire pour ceux qui
  l'exigent. On les **tend en main propre**, derrière la porte de proximité — et
  désormais **hors de toute séance** : un mot rédigé le soir se remet le
  lendemain matin dans la cour.
- **Tendre son cahier.** Prêter (il le lit, il écrit dans la marge, jamais dans
  le texte, on le reprend d'un clic) ou donner. Un seul prêt à la fois par
  cahier : deux mains ne le tiennent pas ensemble.
- **Un historique léger** : qui vous a donné quoi, à qui vous avez prêté. Assez
  pour jouer une scène, pas un journal comptable.

### 4.6 La correction et la note

- **La marge.** Le maître écrit **sur** le cahier d'un cadet, d'une autre encre
  (rouge, verte ou bleue) et signé. Table séparée plutôt que droit d'écriture
  sur la page : *une copie qu'on peut récrire après coup ne vaut rien, ni comme
  preuve ni comme scène.* Le cadet lit la correction dans son propre cahier et
  voit quelle main l'a portée.
- **L'inspection.** L'encadrement a le **droit** d'ouvrir ce qu'on a apporté —
  c'est un droit, pas une demande. Mais il ne s'exerce pas à distance, jamais
  en cachette (le propriétaire est averti), et en lecture seule.
- **Les notes.** Intitulé, chiffre, appréciation. Portées depuis la séance ou
  depuis la classe. Relevé par cadet, moyenne ramenée sur 20. Chacun ne voit
  que le sien : *comparer les moyennes à voix haute est une scène de cour de
  récréation, pas d'académie.*

### 4.7 Le RolePlay

- **Fiches de personnage** : nom RP, grade, corps, régiment, selon l'univers.
- **Livret de service** : promotions, sanctions, faits d'armes, aptitudes.
- **Classement** de promotion.
- **Balisage HRP** : ce qui est dit hors personnage est marqué comme tel.
- **Univers configurable** — calendrier, grades, corps, vocabulaire.

### 4.8 Cohabiter avec Roblox

- **La fenêtre d'à-côté** (Document Picture-in-Picture) : l'interface se
  détache dans une fenêtre **toujours au-dessus des autres**, y compris d'un
  jeu en plein écran fenêtré. Quatre formes — Colonne, Bandeau, Carré, Large.
  La *position* appartient au navigateur : on peut demander une taille, pas des
  coordonnées, et un redimensionnement refusé le dit au lieu de faire semblant.
- **La console d'à-côté.** Déplacer le site entier dans une vignette posée sur
  le jeu était juste, et inutilisable : pour tendre un mot il fallait traverser
  trois écrans, dans une fenêtre haute de trois cents pixels, entre deux
  répliques. Cinq entrées — Cahier, Note, Papiers, Sac, Gestes — et chacune
  ouvre des **gestes réels**, jamais un lien vers « la page où c'est ». Elle
  compte ce qui attend une réponse.
- **Mode PWA** `standalone` : plus de barre d'adresse ni d'onglets.
- **Densités d'affichage** — confortable, moyen, compact, minimal.

### 4.9 Le reste

Documents (PDF découpé en images, import), exercices auto-corrigés, archives de
séance, modèles de cours, bibliothèque, journaux d'activité, rôles et
permissions (RBAC en base), modérateurs, recherche, notifications.

---

## 5. Ce qui ne va pas, aujourd'hui

*Cette section est la plus importante pour qui reprend le projet.*

### 5.1 Le déploiement est automatique (depuis le 27 septembre)

**classe-parallele est relié au dépôt GitHub.** Chaque poussée sur la branche de
production déclenche une construction Netlify
(`node outils/config-depuis-env.mjs`, publication de `.`), et le site est en
ligne une minute plus tard.

Ce n'était pas le cas avant, et c'est ce qui a fait croire pendant des jours que
« rien ne marche » : le projet avait été créé par un envoi de fichiers, sans lien
Git. Pire, le dossier local du propriétaire était relié par le CLI à un **ancien
projet, `ojm-academy`**, hébergé sur un autre compte. Les modifications partaient
donc bien quelque part, mais pas là où on les regardait. Le lien a été refait
avec `netlify unlink`, `netlify link --id …` puis `netlify init`.

Pour vérifier qu'une publication vient bien de GitHub : dans *Deploys*, elle
porte un nom de branche et un commit. « Deploy triggered by upload » signifie un
envoi manuel.

### 5.2 Les jetons de déploiement expirent

`401 Unauthorized` signifie « jeton périmé », rien d'autre. Il faut en demander
un neuf et remplacer le contenu de `jeton-netlify.txt` — fichier local, ignoré
par git, car le dépôt est public et ce jeton permettrait à quiconque de publier
sur le site.

### 5.3 GitHub Pages n'est pas activé

Le flux `.github/workflows/pages.yml` existe et échoue à chaque push. Le jeton
d'un workflow n'a pas le droit de créer le site Pages — aucune option ne le
contourne. Il faut l'allumer une fois à la main : *Settings → Pages → Source :
GitHub Actions*.

### 5.4 Ce qui reste à faire

- Les **trente-sept dessins** peuvent être remplacés par des illustrations plus
  riches. Contrainte : vue strictement de face, silhouette lisible à 26 px,
  aucun texte dans l'image, et la même direction artistique pour tous — c'est
  pour cela qu'ils sortent d'un seul générateur. Le cahier des charges est dans
  `docs/OBJETS-VISUELS.md`.
- La migration **`0018_les_affaires`** est appliquée au projet Supabase ; le
  site en ligne n'en profitera qu'une fois redéployé (voir 5.1).
- **Export PDF** d'un cahier ou d'une archive.
- **Convocations programmées.**
- **Édition collaborative** d'un cahier (CRDT) — aujourd'hui, le dernier qui
  écrit gagne.
- **Recherche plein texte** (tsvector) — aujourd'hui, recherche simple.

---

## 6. Les principes de conception, énoncés

Ils reviennent partout dans le code et expliquent la plupart des choix.

1. **Le site constate, il ne devine pas.** Ce qui se passe dans Roblox est
   attesté par un humain. Le logiciel n'invente jamais une présence.
2. **Un geste, pas un formulaire.** Tendre un papier, boucler un sac, porter
   une note sont des scènes à jouer. Si l'interface les réduit à des cases à
   cocher, le RP meurt.
3. **Une sanction doit être jouable.** Elle tombe d'elle-même, le maître peut
   l'abréger, et elle ne frappe jamais avant qu'on ait eu l'occasion d'agir.
4. **La copie du cadet est intangible.** Le maître écrit à côté, jamais à la
   place. *Une copie qu'on peut récrire après coup ne vaut rien.*
5. **Rien ne s'impose à personne.** Un objet tendu s'accepte ou se refuse.
6. **Une fausse bonne nouvelle est pire qu'une erreur.** Un « Terminé » après
   un échec fait croire que tout va bien — c'est le pire des deux.
7. **Ce qui exige une manœuvre manuelle pour se voir n'est pas livré.**

---

## 7. Repères pour s'orienter dans le code

| Chemin | Contenu |
|---|---|
| `src/app.js` | Routes, démarrage. |
| `src/core/` | Routeur, état, permissions, lexique, RP, utilitaires. |
| `src/data/` | Contrat, pilote Supabase, pilote local. |
| `src/features/` | Affaires (catalogue), établi du cartable, matériel demandé, transferts, privation, console d'à-côté, tableau, papier, cahier tendu, marge, bulletin, livret, proximité, fenêtre flottante… |
| `src/vues/` | Une vue par page. `salle.js` est la plus grosse : la séance en direct. |
| `styles/` | Jetons de design, mise en page, objets, tableau, cahier, séance. |
| `supabase/migrations/` | 18 migrations, chacune commentée sur son intention. |
| `assets/objets/` | Les trente-sept dessins SVG, produits par `outils/dessiner-objets.mjs`. |
| `outils/essais.mjs` | Les essais de bout en bout. |
| `docs/` | Architecture, déploiement, cahier des charges visuel, ce document. |

Les migrations les plus récentes valent lecture pour comprendre les systèmes
récents : `0011_objets` (cartable, papiers), `0015_matiere_et_notes`
(privation, marge, notes), `0016_cahier_tendu` (prêt et don),
`0017_equiper_a_chaque_seance`, et surtout **`0018_les_affaires`** — c'est là
que les objets cessent d'être des mots et deviennent des choses.

---

### 7.1 Les essais

    node outils/essais.mjs

Quarante-neuf scénarios joués dans un vrai navigateur sur le pilote local. Ils
ne vérifient pas que les boutons existent : ils vérifient que les **gestes** ont
les conséquences annoncées — qu'un texte écrit se retrouve après un
rechargement, qu'un objet donné n'est plus chez celui qui l'a donné, qu'un refus
ne perd rien, et qu'on ne confisque pas ce qui n'a pas été apporté. Deux onglets
= deux comptes, comme pour le mode démonstration.

---

## 8. Ce qu'il faut retenir

Classe Parallèle n'est pas un LMS avec un habillage militaire. C'est une
tentative de rendre **les objets d'une salle de classe réellement présents** :
un sac qu'on prépare, une plume qu'on oublie, un cahier qu'on tend à son
voisin, une correction écrite dans la marge d'une main qu'on reconnaît.

Chaque fois qu'un arbitrage s'est présenté entre la commodité logicielle et la
vérité de la scène, c'est la scène qui a gagné. C'est ce qui explique les
choix qui paraissent compliqués — la privation qui attend, le prêt qui
s'accepte, la marge qui ne touche pas au texte.
