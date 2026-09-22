# OJM Academy

Environnement scolaire numérique **parallèle** à un serveur Roblox RP.

Roblox reste le jeu et le lieu du RolePlay. Le site prend en charge tout ce qui
alourdirait le serveur : cahiers, tableau, documents, exercices, présences,
progression, archives. Les deux fonctionnent côte à côte, sans qu'une seule
ligne du jeu ait besoin d'être modifiée.

```
ROBLOX                          OJM ACADEMY
RolePlay, présence en jeu  ←→   cours, cahiers, tableau, exercices, archives
```

---

## À côté du jeu

Le site est fait pour cohabiter avec Roblox, pas pour le remplacer. Trois
façons de le garder sous la main :

**La fenêtre d'à-côté** — le bouton ⤴ de la barre supérieure, ou `Ctrl+Maj+F`.
L'interface se détache dans une petite fenêtre qui **reste au-dessus de toutes
les autres**, y compris d'un jeu en plein écran fenêtré (Document
Picture-in-Picture, Chrome et Edge). On relit une consigne sans quitter la
partie. Refermer la fenêtre ramène l'interface dans l'onglet, sans rien perdre.

Quatre formes au choix dans le menu ⊞ : **Colonne** pour écrire sur le côté,
**Bandeau** pour suivre en bas de l'écran, **Carré**, **Large**. La position,
elle, appartient au navigateur — on attrape la fenêtre et on la pose où l'on
veut.

**Installer l'application** — le bouton ⊕ dans la barre d'adresse du
navigateur. Le site s'ouvre alors dans sa propre fenêtre : **ni onglets, ni
barre d'adresse**, juste l'interface.

**Les densités** — `Ctrl+\` fait défiler Grand → Moyen → Compact → Minimal.
En Compact le rail se réduit à une colonne d'icônes ; en Minimal il disparaît.
`Ctrl+Maj+M` bascule directement en Minimal.

## Mettre le site en ligne

Site statique : ni compilation, ni serveur. On dépose le dossier tel quel.

**Netlify, une fois** — depuis une copie locale du dépôt :

```bash
npx -y netlify-cli deploy --prod --dir . --site <identifiant-du-projet>
```

**Netlify, en continu** — *Project configuration › Build & deploy ›
Continuous deployment › Link repository*, branche `main`. Ne touchez ni à la
commande de build ni au dossier à publier : `netlify.toml` les porte déjà.
Chaque poussée republie alors le site toute seule.

Les identifiants Supabase se mettent dans les variables d'environnement du
projet (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) : la commande de build les dépose
dans `config.js`. Sans variables, le `config.js` versionné sert de repli, ce
qui garde le glisser-déposer et l'ouverture en local fonctionnels.

Tout est détaillé dans [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

**GitHub Pages** — `.github/workflows/pages.yml` publie à chaque poussée sur
`main`. Gratuit et sans minutes comptées pour un dépôt public, là où un
hébergeur à quota finit par suspendre les déploiements. À activer une fois
dans *Settings › Pages › Source : GitHub Actions*. Les identifiants peuvent
venir de *Settings › Secrets and variables › Actions › Variables* ; sans eux,
le `config.js` versionné sert.

**Sans rien installer** — `page-unique.html` contient l'application entière en
un seul fichier. Il s'ouvre depuis le disque, s'envoie par courriel, ou se
dépose sur [app.netlify.com/drop](https://app.netlify.com/drop).

---

## En deux minutes

Le professeur ouvre une session et obtient un code :

```
K7F-29A
```

Il l'annonce en jeu. Les élèves le saisissent sur la page d'accueil et entrent
dans la salle. À partir de là, tout est synchronisé : le tableau du professeur,
la page du cahier commun affichée, le document distribué, l'exercice lancé.

Chaque élève garde en parallèle **son cahier personnel**, que personne d'autre
ne voit — y compris pendant que le professeur pilote l'affichage.

---

## Démarrer

### Mode démonstration (aucune installation)

Ouvrez `index.html` avec un petit serveur statique :

```sh
python3 -m http.server 8000
# puis http://localhost:8000
```

Laissez `supabaseUrl` et `supabaseAnonKey` vides dans `config.js`. Les données
restent dans le navigateur. **Astuce :** chaque onglet peut ouvrir un compte
différent, et la synchronisation fonctionne entre onglets du même poste — de
quoi tester le duo professeur / élève seul.

Ce mode n'offre aucune sécurité réelle : il sert à essayer, pas à exploiter.

### Mode réel (Supabase)

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Dans l'éditeur SQL, exécutez **dans l'ordre** les fichiers de
   `supabase/migrations/` (de `0001` à `0006`).
3. Renseignez `supabaseUrl` et la clé **publishable** dans `config.js`
   (ou via l'écran *Réglages › Connexion*).
4. Déposez le dossier sur n'importe quel hébergement statique.

Aucune étape de compilation : le site est du HTML, du CSS et des modules ES.

> Le projet de ce dépôt est déjà configuré et migré.

---

## Ce que fait le site

**Pour l'élève**

- cahiers personnels : pages, réglures, mise en forme, dessins, images
- rejoindre une classe avec un code, suivre la session en direct
- voir le tableau du professeur en temps réel
- mode « suivre le professeur », ou navigation libre pour prendre ses notes
- notes personnelles privées pendant le cours, versables dans son cahier
- lever la main, poser une question, répondre aux sondages
- répondre aux exercices, retrouver ses notes, son historique, ses présences

**Pour le professeur**

- créer une classe, gérer le code, accepter, expulser, mettre en silencieux
- ouvrir une session : tableau, cahier commun, documents, exercices
- tableau interactif : 9 outils, plusieurs pages, mode participatif, capture
  vers le cahier commun
- importer des PDF, images ou fiches, les distribuer, les convertir en pages
- construire des exercices (10 types de questions), les lancer en séance,
  suivre l'avancement copie par copie, corriger à la main ou automatiquement
- annonces, sondages, minuteries, compte à rebours, feuille de présence
- journal de séance, archives consultables, reprise d'une séance passée

**Pour le roleplay**

- fiche de personnage par espace : c'est le personnage qui signe, pas le compte
- calendrier de l'univers (« an 850 — 22ᵉ jour du neuvième mois »)
- marquage hors-roleplay `(( … ))` sur les questions, les annonces et les carnets
- univers proposés, avec grades, corps et vocabulaire assortis
- livret de service : mentions, sanctions, promotions et aptitudes
- classement de promotion, public dans l'espace, livrets privés

Voir [`docs/ROLEPLAY.md`](docs/ROLEPLAY.md).

**Pour l'administration**

- rôles et permissions (RBAC) appliqués par la base de données
- comptes, journaux d'activité, modération

---

## Cohabiter avec Roblox

Le site ne s'injecte pas dans le jeu, ne le modifie pas et ne cherche pas à le
piloter. Il propose quatre densités d'affichage (*Réglages › Cohabitation
Roblox*) pour placer la fenêtre du jeu à côté du cahier :

| Densité   | Usage                                              |
|-----------|----------------------------------------------------|
| Grand     | plein écran, confort maximal                        |
| Moyen     | un peu plus dense                                   |
| Compact   | navigation en icônes, Roblox à côté                 |
| Minimal   | cahier seul, encombrement minimum                   |

`Ctrl` + `\` passe de l'une à l'autre. Tous les raccourcis sont modifiables.

---

## Organisation du dépôt

```
index.html                 châssis de l'application
config.js                  URL et clé publique Supabase, nom de l'académie
styles/                    jetons de design, châssis, composants, cahier, tableau
src/
  app.js                   amorçage et table de routage
  core/                    configuration, état, routeur, permissions, réseau,
                           raccourcis, assainissement HTML, lexique RP
  data/                    façade de données + deux pilotes (Supabase, local)
  features/                éditeur de cahier, moteur du tableau, exercice en
                           direct, conversion de documents
  ui/                      fabrique d'éléments, modales, toasts, châssis
  vues/                    une vue par écran
vendor/                    supabase-js et pdf.js livrés avec le site
supabase/migrations/       schéma, RLS, procédures, référentiel, correctifs
docs/                      architecture, déploiement, feuille de route
```

Documentation détaillée : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/ROLEPLAY.md`](docs/ROLEPLAY.md),
[`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md),
[`docs/FEUILLE-DE-ROUTE.md`](docs/FEUILLE-DE-ROUTE.md).

---

## Sécurité

L'autorité, c'est la base de données. Les vérifications côté navigateur ne
servent qu'à ne pas afficher ce qui n'a pas lieu d'être : chaque table porte
ses politiques RLS, et les opérations sensibles passent par des fonctions
`SECURITY DEFINER` qui contrôlent les droits avant d'agir.

Le contenu des cahiers est saisi en HTML dans un champ éditable : il est
assaini (liste blanche stricte) à chaque aller-retour, pour qu'un élève ne
puisse pas exécuter de script dans le navigateur de son professeur.

Détails et vérifications dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
