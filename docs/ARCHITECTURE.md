# Architecture

Un site statique : HTML, CSS et modules ES, sans compilation. Une base
Supabase (PostgreSQL, RLS, Realtime, Storage) en fait l'arrière-boutique.

```
index.html · boot.js · config.js     châssis, garde-fou de démarrage, configuration publique
styles/                              waitlist.css (copie exacte du style Whitelist Hub), classe.css (habillage), cahier, tableau, séance, animations.css (papier jeté, papier déchiré, livre qui s'ouvre)
src/
  app.js                             amorçage, table de routage
  core/                              état, session, routeur, permissions, réseau, hôte du document
  data/                              façade (index.js) + deux pilotes : supabase.js et local.js
  features/                          éditeur de cahier, encre, mode flottant, tableau, import PDF
  ui/                                éléments, modales, notifications, châssis, fragments
  vues/                              un fichier par écran
supabase/migrations/                 le schéma, la RLS, les procédures — la vraie autorité
outils/                              essais, construction de la page autonome, config par l'environnement
docs/                                déploiement, commandes, nettoyage de la base
```

## Ce que fait le produit

| | |
|---|---|
| **Cahiers** | plusieurs cahiers par élève, pages, mise en forme, pense-bêtes, images ; sauvegarde différée avec brouillon local de secours |
| **Documents** | bibliothèque de la classe et personnelle, import de PDF et d'images, affichage en séance |
| **Séance** | tableau synchronisé en direct, document affiché à la classe, son cahier à côté |
| **Mode flottant** | le cahier dans une petite fenêtre au-dessus du jeu (Document Picture-in-Picture, Chrome/Edge) ; fenêtre détachée ailleurs |
| **Boutique** | encre et cahiers supplémentaires **commandés par missive**, payés en jeu et livrés par le PDG (voir `COMMANDES.md`) |

Autour : comptes et rôles (RBAC appliqué par la base), classes à code, annonces,
exercices, archives de séances, modération, journal d'activité.

## Où vit chaque règle

**L'autorité, c'est la base.** Le navigateur n'affiche que ce que la base permet.

- Droits de lecture et d'écriture : politiques RLS (`0002` et suivantes).
- Encre et quota de cahiers : déclencheurs de `0039_boutique.sql` — un client modifié
  ne peut ni écrire sans encre, ni créer un cahier non autorisé, ni créditer quoi que ce soit.
- Crédit d'une commande : `admin_livrer_commande()`, réservée au PDG et aux super administrateurs (permission `MANAGE_SHOP`).
- Limite de pages par cahier : déclencheur de `0041` (réglage `max_pages`).
- Rôles : le PDG est au-dessus des super administrateurs et intouchable par eux (`0041`).
- L'interface (`encre.js`, `accueil.js`, l'éditeur) **prévient** : elle grise, elle
  explique, elle évite de taper dans le vide. Elle ne décide de rien.

## Le flux d'une écriture

```
frappe ──▶ beforeinput : l'encre estimée suffit-elle ?  non → rien ne s'écrit, bandeau
        ──▶ sauvegarde différée (900 ms) ──▶ UPDATE notebook_pages
              ──▶ déclencheur : mesure l'AJOUT de texte, débite, ou refuse (IK001)
              ──▶ refus : le texte reste en brouillon sur l'appareil, aucune boucle de réessai,
                  la page repart d'elle-même quand l'encre revient
```

Lire ne passe jamais par ce chemin : un compte sans encre ouvre tous ses cahiers.

## Pilote local (démonstration)

`src/data/local.js` répond à la même interface que Supabase, avec le stockage du
navigateur. Il **reproduit** les règles (mêmes seuils, mêmes codes d'erreur) pour
que la démonstration et les essais se comportent comme le serveur, mais il
**ne protège rien** (tout est modifiable depuis la console du navigateur) et ne peut
**jamais** acheter. Ne pas l'utiliser en production.

## Essais

```
python3 -m http.server 8777          # dans un terminal
node outils/essais.mjs               # dans un autre (Playwright requis)
```

Ils jouent des scénarios réels dans Chromium : écrire et retrouver, cahier payant,
encre épuisée, prix et historique, mode flottant, séance, chaque écran.
**Ils n'éprouvent pas le SQL** — voir `COMMANDES.md`, « Vérifier sur une vraie base ».
