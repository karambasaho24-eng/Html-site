# Objets de la scène — prompts de génération

À coller dans ChatGPT (génération d'images). Le premier bloc est la **charte** :
on la donne une fois, en début de conversation. Les suivants sont les **séries**,
une par message.

Deux contraintes qui décident de tout :

- **Les objets se lisent à 24–32 px** dans le cartable et la trousse. Une belle
  texture invisible à cette taille ne sert à rien : ce qui compte est la
  silhouette. Un objet qu'on ne reconnaît pas à la taille d'un ongle est raté,
  si détaillé soit-il.
- **Aucun texte dans l'image.** Les titres sont écrits par le site, en police
  variable et en plusieurs langues. Du texte peint dans l'image ferait doublon
  et se contredirait.

---

## 1. La charte (à donner en premier)

```
Tu vas produire une série d'objets pour une académie militaire fictive, dans un
registre début XXᵉ européen : cuir, laiton, bois, toile huilée, papier fort.
Ni fantasy, ni steampunk, ni moderne — l'équipement scolaire et militaire d'une
école d'officiers vers 1910.

STYLE
— Rendu réaliste et sobre, matières lisibles : grain du cuir, veine du bois,
  oxydation du laiton, fibre du papier.
— Objet isolé, vu de trois quarts, légèrement en plongée (environ 15°).
— Lumière douce venant du haut à gauche, une seule source, ombre de contact
  très discrète sous l'objet. Pas d'ombre portée longue.
— Usure crédible : coins frottés, cuir patiné, métal terni. Rien de neuf, rien
  de détruit. Ces objets servent tous les jours depuis des années.
— Aucun texte, aucune lettre, aucun chiffre, aucun logo, aucune marque.
— Pas de main, pas de personnage, pas de décor, pas de bureau sous l'objet.

PALETTE (à respecter strictement)
— Cuirs et bois : #6f5a3c, #48391f, #7b6942
— Toile et drap militaire : #7d8c58, #5c6840, #4a4f45
— Laiton et ferrures : #c9a227, #9a7b1c, #e2c25c
— Papier : #faf5ea, #f3ead9, #e8dcc4, #d6c6a8
— Rouge d'encre et de cire : #9c4a44
— Gris-bleu d'ardoise : #4f6d7a
Pas de saturation vive, pas de couleur hors de cette liste.

FORMAT
— Carré, 1024 × 1024.
— Objet centré, occupant environ 80 % de la hauteur, marge vide tout autour.
— Fond uni #0d1013 (un noir bleuté), parfaitement plat, sans dégradé ni vignette,
  pour que le détourage soit net.

LISIBILITÉ — le point le plus important
Ces objets seront affichés à 24 pixels de haut. Choisis l'angle et le cadrage
qui rendent la silhouette reconnaissable à cette taille. Privilégie une forme
franche et un contraste net entre l'objet et le fond, plutôt qu'une accumulation
de détails fins.

Réponds « compris » et attends ma première série.
```

---

## 2. Le sac et la trousse

```
Série 1 — le sac et la trousse. Quatre images, une par objet.

1. CARTABLE FERMÉ — sacoche d'écolier en cuir fauve patiné, rabat rabattu,
   deux sangles à boucles de laiton, poignée sur le dessus, soufflets latéraux.
   Format paysage, trapu, un peu gonflé par ce qu'il contient.

2. CARTABLE OUVERT — le même, rabat relevé, on aperçoit la tranche de deux ou
   trois cahiers et le haut d'une trousse. Contenu suggéré, pas détaillé.

3. TROUSSE FERMÉE — étui plat en cuir brun foncé ou en toile huilée olive,
   fermé par une patte et un bouton de laiton. Forme allongée, coins arrondis,
   cuir gondolé par l'usage.

4. TROUSSE OUVERTE — la même, dépliée à plat, montrant des passants de cuir qui
   retiennent les instruments. Les emplacements sont visibles ; les instruments
   eux-mêmes restent flous ou absents, ils seront générés à part.
```

---

## 3. Le contenu de la trousse

```
Série 2 — les six fournitures. Six images, chacune un seul objet isolé,
posé horizontalement ou en légère diagonale.

1. PLUME — porte-plume en bois tourné sombre, virole de laiton, bec d'acier
   bleui. Une trace d'encre séchée près du bec.
2. ENCRIER — petit flacon de verre épais à facettes, encre noire aux trois
   quarts, bouchon de laiton à vis, reflets sur le verre.
3. CRAYON — crayon de bois hexagonal non peint ou olive, taillé au couteau
   (taille irrégulière, pas au taille-crayon), mine grise usée.
4. GOMME — bloc de caoutchouc beige-gris, arêtes émoussées, coins noircis et
   salis par la mine.
5. RÈGLE — règle plate de buis clair, 20 cm, graduations gravées SANS AUCUN
   CHIFFRE (traits seuls, longs et courts), arête rapportée en laiton, bois
   jauni et légèrement voilé.
6. BUVARD — rectangle de papier buvard rose-beige épais, absorbé de taches
   d'encre sèches irrégulières, bords fibreux non coupés net.
```

---

## 4. Les supports

```
Série 3 — les quatre supports sur lesquels on écrit. Quatre images.
Vus de trois quarts, fermés, légèrement inclinés, pour qu'on distingue
l'épaisseur de la tranche.

1. FEUILLE — une seule feuille de papier fort crème, libre, coin corné, un pli
   de pliage marqué. Très fine, presque sans épaisseur.
2. CAHIER — cahier cousu, couverture cartonnée brun-fauve, dos toilé noir,
   étiquette rectangulaire vierge collée sur le plat (VIERGE, sans écriture),
   tranche de pages crème visible.
3. CARNET — petit carnet de poche vert-de-gris sombre, format haut et étroit,
   élastique de fermeture, coins arrondis, tranche irrégulière.
4. DOSSIER — chemise cartonnée sable, rabats de côté, lien de coton plat,
   épaisse de quelques documents, coins mous et fatigués.
```

```
Série 4 — les six couvertures du même cahier. Six images du MÊME cahier
(même format, même angle, même lumière), seule la matière change.

1. PARCHEMIN — carton crème fibreux, aspect papier-parchemin.
2. CUIR — cuir brun-fauve souple, grain visible, coins usés.
3. ARDOISE — toile gris-bleu sombre, aspect minéral mat.
4. OLIVE — toile militaire vert olive terne.
5. BORDEAUX — toile rouge sombre, presque brune, passée.
6. ENCRE — toile noir-bleuté très sombre, presque monochrome.

Impératif : ce doit être visiblement le même objet six fois, pas six cahiers
différents. Même cadrage, même inclinaison, même éclairage.
```

---

## 5. Les papiers qu'on se tend

```
Série 5 — cinq documents qui circulent de main en main. Cinq images.
Papier vu du dessus, à plat, très légèrement de biais.
AUCUN TEXTE LISIBLE : si de l'écriture apparaît, qu'elle soit réduite à des
traits d'encre indistincts, comme vus de loin.

1. MOT — petit papier plié en quatre puis rouvert, plis bien marqués, bords
   irréguliers déchirés à la main, deux ou trois lignes griffonnées.
2. ORDRE DE MISSION — feuille de papier fort, cachet de cire rouge sombre
   (#9c4a44) en bas à droite, empreinte abstraite sans emblème identifiable,
   un pli horizontal.
3. CONVOCATION — demi-feuille plus petite, cadre imprimé à filet simple,
   cachet de cire rouge, coin supérieur perforé d'un trou de classement.
4. LAISSEZ-PASSER — carte rigide beige, format paysage, coins coupés en biais,
   cachet de cire et une bande diagonale olive imprimée.
5. RAPPORT — feuille réglée couverte d'une écriture serrée et illisible, sans
   cachet, avec un trombone d'acier terni en haut à gauche.
```

---

## 6. Les accessoires

```
Série 6 — trois objets d'appoint. Trois images.

1. CACHET — sceau à main : manche de bois tourné, matrice de laiton gravée
   d'un motif abstrait (surtout pas un blason reconnaissable), posé debout.
2. PAIN DE CIRE — bâton de cire à cacheter rouge sombre, une extrémité fondue
   et durcie en coulure.
3. TROMBONE ET ÉPINGLE — un trombone d'acier terni et une épingle à tête de
   laiton, posés côte à côte. Objet minuscule, cadrage serré.
```

---

## Après la génération

1. **Détourer.** ChatGPT ne rend pas de vraie transparence : le fond `#0d1013`
   uni se retire proprement (baguette magique, tolérance basse) ou se laisse tel
   quel, puisque c'est exactement le fond de l'application.
2. **Vérifier à la taille réelle.** Réduire chaque image à 32 px de haut et la
   regarder. Si on ne reconnaît pas l'objet, c'est l'angle qu'il faut reprendre,
   pas le niveau de détail.
3. **Exporter** en PNG, 256 × 256 pour les vignettes du cartable, 512 × 512 pour
   les couvertures de cahier.
4. **Déposer** dans `assets/objets/` en nommant d'après les clés du code —
   `cartable.png`, `trousse.png`, `plume.png`, `encre.png`, `crayon.png`,
   `gomme.png`, `regle.png`, `buvard.png`, `feuille.png`, `cahier.png`,
   `carnet.png`, `dossier.png`, puis les couvertures `cahier-parchment.png`,
   `cahier-cuir.png`, `cahier-ardoise.png`, `cahier-olive.png`,
   `cahier-oxblood.png`, `cahier-encre.png`, et les papiers `papier-note.png`,
   `papier-ordre.png`, `papier-convocation.png`, `papier-laissezpasser.png`,
   `papier-rapport.png`.

Les noms comptent : ce sont ceux que `styles/objets.css` et
`src/features/cartable.js` emploient déjà pour leurs figures dessinées en CSS.
Une fois les fichiers en place, il suffira de remplacer les dégradés par les
images, sans toucher au reste.
