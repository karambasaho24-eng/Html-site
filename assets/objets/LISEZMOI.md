# Les images des objets

Déposez ici les PNG générés, sous ces noms exacts. Le code les cherche tels
quels ; tant qu'un fichier manque, la figure dessinée en CSS reste affichée à
sa place — rien ne casse, l'objet est simplement moins beau.

## Le sac et la trousse
- `cartable.png` — cartable fermé
- `cartable-ouvert.png` — cartable ouvert, rabat relevé
- `trousse.png` — trousse fermée
- `trousse-ouverte.png` — trousse dépliée, passants vides

## La trousse
- `plume.png` · `encre.png` · `crayon.png` · `gomme.png` · `regle.png` · `buvard.png`

Les noms des fournitures suivent `TROUSSE_DEFAUT` dans
`src/features/cartable.js`, passés en minuscules et sans accent : « Plume » →
`plume.png`, « Règle » → `regle.png`.

## Les supports
- `feuille.png` · `cahier.png` · `carnet.png` · `dossier.png`

## Format
PNG, 256 × 256, fond `#0d1013` uni (celui de l'application) ou transparent.
Vérifiez chaque image réduite à 32 px : si l'objet n'y est plus reconnaissable,
c'est l'angle qu'il faut reprendre, pas le niveau de détail.
