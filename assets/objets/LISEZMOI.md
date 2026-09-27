# Les images des objets

Les quatorze dessins sont **livres avec le depot**, en SVG. Il n'y a rien a
telecharger, rien a installer : ils s'affichent des le premier chargement.

Le code les cherche par leur nom, calcule depuis l'intitule de l'objet
(`imageObjet()` dans `src/features/cartable.js`) : minuscules, sans accent.
« Regle » devient donc `regle.svg`.

## Le sac
`cartable.svg` · `cartable-ouvert.svg` · `trousse.svg` · `trousse-ouverte.svg`

## La trousse
`plume.svg` · `encre.svg` · `crayon.svg` · `gomme.svg` · `regle.svg` · `buvard.svg`

## Les supports
`feuille.svg` · `cahier.svg` · `carnet.svg` · `dossier.svg`

## Pourquoi du SVG plutot que des images generees

Ces objets s'affichent a 24 pixels de haut dans le cartable. A cette taille,
une photographie devient une tache brune : c'est la silhouette qui porte la
reconnaissance, pas le grain du cuir. Le SVG donne des formes franches a
n'importe quelle taille, pese quelques centaines d'octets, et se recolore en
changeant une ligne.

Si vous voulez les remplacer par des dessins plus riches, gardez ces noms et
posez les fichiers ici — en `.svg`. Verifiez chaque image reduite a 32 px : si
l'objet n'y est plus reconnaissable, c'est l'angle qu'il faut reprendre, pas le
niveau de detail.
