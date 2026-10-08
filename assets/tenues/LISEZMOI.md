# Tenues des personnages (salle en 3D)

Les personnages portent des vêtements au **format Roblox classique** : une image
de 585 × 559 pour la chemise, une autre pour le pantalon (le gabarit officiel :
torse en croix en haut, bras ou jambes en bas). Elles se plaquent exactement
comme dans le jeu.

Pour ajouter une tenue du jeu :

1. Déposer ici `nom-chemise.png` et `nom-pantalon.png` (images **sans filigrane**,
   dont on a le droit de se servir).
2. Les déclarer dans `src/features/tenues.js`, objet `TENUES_IMAGES` :

   ```js
   cadet: {
     libelle: "Brigade d'entraînement", famille: "uniforme",
     images: { chemise: "assets/tenues/veste-brune.png", pantalon: "assets/tenues/pantalon-harnais.png" },
     insigne: "entrainement",            // cousu sur la poche, les épaules et le dos
     veste: "#b8743f", chemise: "#e6dfb0", pantalon: "#efece6"   // le nuancier
   }
   ```

Les vestes des régiments (`veste-brune.png`, `veste-verte.png`) et le pantalon
à harnais (`pantalon-harnais.png`) sont ceux fournis pour le serveur ; les
blasons sont dessinés dans `tenues.js`, pas pris à la série.

Sans image, les tenues dessinées dans `tenues.js` s'appliquent.
