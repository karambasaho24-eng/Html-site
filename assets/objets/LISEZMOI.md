# Les images des objets

Les dessins sont **livres avec le depot**, en SVG. Il n'y a rien a telecharger,
rien a installer : ils s'affichent des le premier chargement.

Ils ne sont pas ecrits a la main. Ils sortent tous de `outils/dessiner-objets.mjs`,
et c'est le point : la plaque sombre, la lumiere venue du haut-gauche, l'ombre
de contact et les matieres (cuir fauve, toile huilee olive, laiton terni, buis,
acier, papier jauni, encre) sont definies une seule fois et partagees. Un
cartable et une trousse ont donc l'air d'etre du meme tannage.

Pour regenerer, ou pour ajouter un objet :

    node outils/dessiner-objets.mjs

Le code cherche l'image par le type de l'objet, minuscules et sans accent
(`imageObjet()` dans `src/features/affaires.js`). « Regle a calcul » devient
donc `regle-a-calcul.svg`. Un type sans dessin retombe sur `autre.svg`.

## Pourquoi du SVG plutot que des images generees

Ces objets s'affichent entre 18 et 30 pixels de haut. A cette taille, une
photographie devient une tache brune : c'est la silhouette qui porte la
reconnaissance, pas le grain du cuir. Le vecteur donne des formes franches a
n'importe quelle echelle, pese quelques centaines d'octets, et se recolore en
changeant une ligne.

C'est aussi pourquoi la plume et le crayon ne se ressemblent pas : manche
renfle et bec d'acier d'un cote, corps conique et virole de cuivre de l'autre.
Deux batonnets diagonaux auraient ete indistinguables a 26 pixels.

## Verifier une image

Reduisez-la a 26 px. Si l'objet n'y est plus reconnaissable, c'est l'angle ou
la silhouette qu'il faut reprendre, pas le niveau de detail.
