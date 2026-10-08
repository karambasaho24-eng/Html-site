# Blocus Assault

Carte collaborative en temps réel des blocus de lycées (portails, police, incendies, embouteillages, alertes, chat).

- Site 100 % statique (HTML/CSS/JS), bibliothèques embarquées dans `vendor/`.
- Carte : Leaflet + OpenStreetMap / CARTO / Esri, Google Maps intégré (fiche lycée + bouton « G »). Avec une clé `googleMapsKey` dans `data.js`, la carte en direct passe sur le fond Google Maps officiel.
- Lycées et portails chargés à la volée via l'API Overpass (OpenStreetMap).
- Temps réel : Supabase (tables `ba_reports`, `ba_chat`, vue `ba_ranking`, fonctions `ba_*`).
- Comptes facultatifs : pseudo + mot de passe (haché bcrypt côté base), aucun e-mail.

## Déploiement Netlify
Projet Netlify `blocus-assault` — base directory : `blocus-assault`, publish : `.` (voir `netlify.toml`), aucune commande de build.
