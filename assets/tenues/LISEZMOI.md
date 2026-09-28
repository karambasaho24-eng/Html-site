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
   export const TENUES_IMAGES = {
     cadet: { chemise: "assets/tenues/cadet-chemise.png", pantalon: "assets/tenues/cadet-pantalon.png" }
   };
   ```

Sans image, les tenues dessinées dans `tenues.js` s'appliquent.
