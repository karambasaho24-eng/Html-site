# Intégration des animations

Base conservée : Ojm_frutiger-main. Aucune vue de la seconde archive n’a remplacé une vue de la base.

- `src/ui/animations.js` : gestes réutilisables de la version animée.
- `styles/animations-integrees.css` : classes d’animation et support de la réduction des mouvements.
- `src/features/editeur-cahier.js` : ouverture du cahier et disparition d’une page après suppression confirmée côté serveur.

La base contient déjà des animations dans `liquide.css`, `objets.css`, `scene.css`. Elles ont été préservées.

À vérifier dans le navigateur : édition du cahier, suppression de page, préférences de réduction des mouvements. Aucune migration Supabase n’a été appliquée.
