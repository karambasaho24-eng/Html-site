# Classe Parallèle

Un espace scolaire **à côté de Roblox** : des cahiers numériques, de la prise de
notes, des documents de cours, et un mode flottant pour écrire sans quitter le jeu.

Roblox reste le lieu du cours. Le site apporte ce qui lui manque : un vrai cahier
par matière, les documents du professeur, un tableau partagé en séance.

## Ce que fait le site

- **Cahiers** — plusieurs cahiers, pages, mise en forme, pense-bêtes, images. Les
  notes se sauvegardent toutes seules, avec un brouillon de secours sur l'appareil.
- **Documents** — ceux de la classe et les vôtres ; PDF et images consultables, et
  convertibles en pages de cahier.
- **Séance** — le tableau du professeur en direct, un document affiché à toute la
  classe, et son propre cahier ouvert à côté pour prendre des notes.
- **Mode flottant** — le bouton de la barre pose le cahier dans une petite fenêtre
  **au-dessus des autres** (Chrome et Edge sur ordinateur), y compris d'un jeu en
  fenêtré. Il ne s'intègre pas à Roblox et ne passe pas au-dessus d'un jeu en plein
  écran exclusif. Ailleurs, il ouvre une fenêtre détachée à placer à côté du jeu.
- **Encre et cahiers** — voir plus bas.

Autour : comptes et rôles, classes à code d'invitation, annonces, exercices,
archives de séances, modération et journal d'activité.

## L'encre, les cahiers et les commandes

- Écrire (texte, pense-bêtes, tracés au tableau, images) consomme de l'**encre**. Sans
  encre, on ne peut plus rien **ajouter** ; on peut toujours **ouvrir et lire** tous ses
  cahiers et ses documents.
- Le **premier cahier est gratuit**, les suivants se commandent. Un cahier est **plein à
  N pages** (N réglable). La réserve de départ est **petite** et réglable.
- **Le paiement se fait en jeu, pas sur le site.** L'élève envoie une **missive de
  commande** (un pigeon voyageur), paie en jeu et reste à proximité ; le **PDG livre**
  la commande une fois payé : c'est ce geste, et lui seul, qui crédite l'encre ou le
  cahier. Le site ne prend aucun paiement.
- Les règles sont appliquées **par la base de données**, pas par le navigateur. Le PDG
  règle tout depuis *Administration › Boutique* (articles, prix, limites, commandes,
  comptes), avec un historique daté des changements de prix.
- **Rôles** : le **PDG** (fondateur, intouchable) puis les **super administrateurs**.
- Détails, vérifications à faire sur une vraie base et points à valider :
  [`docs/COMMANDES.md`](docs/COMMANDES.md).

## Démarrer

**Mode démonstration** (rien à installer, rien n'est protégé) :

```sh
python3 -m http.server 8000      # puis http://localhost:8000
```

Laissez `supabaseUrl` et `supabaseAnonKey` vides dans `config.js`. Chaque onglet peut
ouvrir un compte différent : de quoi jouer le professeur et l'élève seul.

**Mode réel** : créez un projet Supabase, exécutez **dans l'ordre** les fichiers de
`supabase/migrations/` (0001 → 0044), renseignez `config.js`, déployez le dossier tel
quel. Détails : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

**Un seul fichier** : `page-unique.html` contient l'application entière (démonstration
possible sans serveur). Il se régénère avec `outils/construire-page-unique.mjs`.

## Essais

```sh
python3 -m http.server 8777 &
node outils/essais.mjs
```

Scénarios réels dans Chromium : écrire et retrouver, cahier payant, encre épuisée,
commandes par missive, limite de pages, rôles, mode flottant, séance, chaque écran. Ils éprouvent l'interface et le
pilote local ; **ils n'éprouvent pas le SQL**, qui doit l'être sur une vraie base.

## Documentation

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) ·
[`docs/COMMANDES.md`](docs/COMMANDES.md) · [`docs/NETTOYAGE-BASE.md`](docs/NETTOYAGE-BASE.md)

## Sécurité

L'autorité, c'est la base : chaque table porte ses politiques RLS, les opérations
sensibles passent par des fonctions `SECURITY DEFINER` qui contrôlent les droits, et
la politique de contenu du site n'autorise que ses propres scripts. Le contenu des
cahiers est assaini à chaque aller-retour. L'URL et la clé « publishable » de
`config.js` sont publiques par nature ; une clé de service n'y a jamais sa place.
