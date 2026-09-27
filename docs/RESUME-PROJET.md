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

### 4.4 Le cartable — le cœur du jeu d'objets

C'est le système le plus travaillé, et celui qui porte l'immersion.

**L'établi.** Deux plateaux : *sur l'étagère* et *dans mon sac*. On clique un
objet, il **traverse physiquement** de l'un à l'autre — technique FLIP : on
relève sa position avant, on le déplace dans le DOM, on le renvoie
optiquement à son point de départ, le navigateur interpole. C'est bien le même
nœud qui vole, pas une copie qui s'allume ailleurs. *Un inventaire où les
choses se téléportent n'est pas un sac, c'est un formulaire à cases.*

**S'équiper à chaque séance.** Le chargement du sac est **permanent** — on ne
refait pas son cartable chaque matin. Mais on **repose la main dessus** avant
d'entrer : une colonne retient la séance pour laquelle il a été confirmé. Un
sac non repris vaut un sac vide, et l'estrade distingue « il a oublié sa
plume » de « il n'a pas repris ses affaires ».

**La page « Mon cartable ».** Accessible depuis le menu, hors séance. Une carte
par classe : ce qui y est demandé, ce qu'on emporte, ce qui manque.

**La privation.** Si le maître l'a activée : sans support ni de quoi écrire, le
cadet **assiste au cours sans pouvoir rien noter** — tableau verrouillé, cahier
en lecture seule. Deux garde-fous, parce qu'une sanction automatique n'est pas
une scène :

1. elle **tombe d'elle-même** à l'échéance (5 à 30 minutes, au choix) ;
2. le maître **seul** accorde d'aller chercher ce qu'on a laissé.

Lever la main n'affranchit pas. Un refus laisse le temps courir. Et la
privation n'est décidée qu'**après** que le cadet a eu l'occasion de s'équiper —
sinon on le punirait d'un geste que l'application ne lui a pas encore proposé.

**Le cartable comme frontière de confidentialité.** Un support apporté peut
être inspecté par l'encadrement ; un support resté chez soi ne le peut pas.
Ce n'est pas du décor, c'est la limite de ce qui est consultable, et elle est
appliquée par la RLS, pas par l'interface.

**Quatorze objets dessinés en SVG**, versionnés dans le dépôt : cartable ouvert
et fermé, trousse ouverte et fermée, plume, encrier, crayon, gomme, règle,
buvard, et les quatre supports. En SVG parce qu'ils s'affichent à 24 px : à
cette taille une photographie devient une tache brune, c'est la silhouette qui
porte la reconnaissance.

### 4.5 Les objets qui circulent

- **Les papiers.** Cinq modèles avec leurs mises en page propres : mot, ordre
  de mission, convocation, laissez-passer, rapport. Cachet de cire pour ceux
  qui l'exigent. On les **tend en main propre**, derrière la porte de
  proximité.
- **Tendre son cahier.** Deux gestes, parce qu'il n'y en a que deux :
  **prêter** (il le lit, il écrit dans la marge, jamais dans le texte, on le
  reprend d'un clic) et **donner** (il change de propriétaire). L'autre accepte
  ou refuse — *un objet qui atterrit dans les mains de quelqu'un sans qu'il ait
  dit oui n'est pas un don, c'est un dépôt.*
- **Un seul prêt à la fois par cahier** : deux mains ne le tiennent pas
  ensemble. C'est un index partiel en base, pas une vérification d'interface.

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
- **Mode PWA** `standalone` : plus de barre d'adresse ni d'onglets.
- **Densités d'affichage** — confortable, moyen, compact, minimal.

### 4.9 Le reste

Documents (PDF découpé en images, import), exercices auto-corrigés, archives de
séance, modèles de cours, bibliothèque, journaux d'activité, rôles et
permissions (RBAC en base), modérateurs, recherche, notifications.

---

## 5. Ce qui ne va pas, aujourd'hui

*Cette section est la plus importante pour qui reprend le projet.*

### 5.1 Le déploiement n'est pas automatique

**Le projet Netlify n'est relié à aucun dépôt.** Pousser sur GitHub ne publie
rien. Chaque mise en ligne exige de lancer `deployer.ps1` à la main sur la
machine du propriétaire.

Cela a déjà causé plusieurs fois la même méprise : des fonctionnalités
livrées, poussées et testées, mais invisibles en ligne pendant des heures — et
la conclusion légitime, côté utilisateur, que « rien ne marche ».

**Le vrai correctif** : relier le dépôt dans Netlify (*Project configuration →
Build & deploy → Link repository*), branche `main`, build
`node outils/config-depuis-env.mjs`, publish `.`. Les variables d'environnement
Supabase sont déjà en place.

Tant que ce n'est pas fait : `deployer.ps1` après chaque changement. Le jeton
de publication expire en quelques heures et doit être régénéré.

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

- Les **quatorze dessins** peuvent être remplacés par des illustrations plus
  riches. Contrainte : vue strictement de face, silhouette lisible à 24 px,
  aucun texte dans l'image. Le cahier des charges complet est dans
  `docs/OBJETS-VISUELS.md`.
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
| `src/features/` | Cartable, privation, tableau, papier, cahier tendu, marge, bulletin, livret, proximité, fenêtre flottante… |
| `src/vues/` | Une vue par page. `salle.js` est la plus grosse : la séance en direct. |
| `styles/` | Jetons de design, mise en page, objets, tableau, cahier, séance. |
| `supabase/migrations/` | 17 migrations, chacune commentée sur son intention. |
| `assets/objets/` | Les quatorze dessins SVG. |
| `docs/` | Architecture, déploiement, cahier des charges visuel, ce document. |

Les migrations les plus récentes valent lecture pour comprendre les systèmes
récents : `0011_objets` (cartable, papiers), `0015_matiere_et_notes`
(privation, marge, notes), `0016_cahier_tendu` (prêt et don),
`0017_equiper_a_chaque_seance`.

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
