# Paiement : l'encre et les cahiers supplémentaires

> **État : aucun paiement n'est branché.** Ce document décrit ce qui existe, ce
> qu'il reste à construire, et ce qu'il faut vérifier **avant** d'ouvrir la vente.
> Tant que le réglage `payments_enabled` vaut `false` (sa valeur par défaut) ET
> qu'aucun prestataire n'est configuré (`paiementUrl` vide), les boutons d'achat
> sont éteints et **rien ne peut être crédité**. Rien dans ce dépôt ne simule un
> achat.

## Ce qui est fait (base de données, migration `0039_boutique.sql`)

**Les règles vivent dans la base, pas dans le navigateur.**

| Règle | Où elle est appliquée |
|---|---|
| Chaque compte a un portefeuille d'encre ; écrire le fait baisser | déclencheurs `BEFORE` sur `notebook_pages`, `sticky_notes`, `board_elements` |
| Sans encre, toute nouvelle écriture est refusée (erreur `IK001`) | `app_debiter_encre()` |
| Les notes déjà écrites restent lisibles sans encre | rien ne touche à la lecture (RLS inchangée pour les propriétaires) |
| Premier cahier gratuit, les suivants s'achètent (erreur `NB001`) | déclencheur `BEFORE INSERT` sur `notebooks` |
| Supprimer un cahier ne rend ni droit ni remboursement | le droit se mesure à `created_total`, qui ne décroît jamais |
| Le navigateur ne peut ni écrire son solde, ni ses droits, ni un prix | aucune politique d'écriture ; droits `INSERT/UPDATE/DELETE` retirés à `authenticated` |
| Créditer un achat n'est possible que par le rôle de service | `fulfill_purchase()` : `EXECUTE` accordé à `service_role` seul |
| Le prix est relu en base au moment de l'achat | `start_purchase()` ; l'achat enregistre une COPIE du prix et des quantités |
| Changer un prix ne touche pas les achats passés | la copie ci-dessus |
| Historique des prix : date et administrateur | déclencheur sur `products` → `product_price_history` |
| Seule l'administration règle la boutique | permission `MANAGE_SHOP` (super_admin, admin), vérifiée dans chaque fonction `admin_*` |
| Tout réglage se change sans toucher au code | tables `products` et `commerce_settings`, écran *Administration › Boutique* |

Ce qui se mesure comme de l'encre : le **texte** ajouté dans une page (balises
exclues), les **images** insérées dans une page, les **pièces jointes**, les
**pense-bêtes**, et chaque **tracé** ajouté par un non-exempté au tableau.
Effacer ne rend rien ; retaper coûte de nouveau.

Par défaut, les rôles `super_admin`, `admin`, `director`, `teacher` et
`instructor` sont **exemptés** d'encre et de quota de cahiers (réglage
`exempt_roles`, modifiable). C'est un choix par défaut, pas une évidence :
à confirmer.

## Ce qui reste à construire : le prestataire de paiement

Il faut deux fonctions serveur (par exemple des *Edge Functions* Supabase) et un
compte chez un prestataire (Stripe Checkout est le plus simple). Le navigateur
n'envoie jamais de prix : seulement l'identifiant (`sku`) du produit.

```
Élève ── POST { sku } + jeton de session ──▶ fonction « checkout »
   1. appelle  start_purchase(sku)  AVEC LE JETON DE L'ÉLÈVE
        → le prix, la quantité et le produit sont lus EN BASE ;
          un achat « pending » est créé avec cette copie
   2. crée la session de paiement chez le prestataire à partir de CET achat
        (montant = unit_price_cents ; ne jamais reprendre un montant du navigateur)
        et y inscrit l'identifiant de l'achat (metadata / client_reference_id)
   3. répond { url } ── le navigateur redirige vers la page du prestataire

Prestataire ── événement signé ──▶ fonction « webhook »
   1. VÉRIFIE LA SIGNATURE sur le corps brut (secret du point d'accès)
   2. n'agit que sur un paiement RÉELLEMENT RÉUSSI
        (Stripe : checkout.session.completed avec payment_status = "paid",
         et checkout.session.async_payment_succeeded pour les moyens différés)
   3. contrôle que le montant et la devise payés = ceux de l'achat « pending »
   4. appelle fulfill_purchase(achat, 'stripe', session, paiement, événement)
        avec la clé de SERVICE (jamais présente dans le navigateur)
        → idempotent : le même événement rejoué ne crédite pas deux fois
```

Réglages à poser **ensuite**, et pas avant :

1. variable d'environnement `PAIEMENT_URL` = adresse de la fonction « checkout »
   (elle finit dans `config.js` à la construction) ;
2. *Administration › Boutique › Réglages › Ouvrir la vente* (`payments_enabled`).

Les remboursements ne sont pas traités automatiquement : le statut `refunded`
existe, mais retirer l'encre ou le cahier correspondant se fait à la main
(*Administration › Boutique › Comptes*), avec un motif, inscrit au journal.

**Ce code n'est pas écrit** : je ne livre pas de code d'argent que je ne peux
pas tester ici (ni compte prestataire, ni PostgreSQL).

## Vérifier avant d'ouvrir la vente

Les migrations n'ont **jamais été exécutées** par leur auteur : l'environnement
de développement ne disposait pas de PostgreSQL. Les essais automatiques
(`node outils/essais.mjs`) éprouvent le comportement de l'interface et du pilote
local, qui reproduit les règles — **pas** la sécurité côté serveur. Sur une copie
de la base (projet Supabase de test), exécutez et constatez :

1. `0039` puis `0040` passent sans erreur, et se rejouent sans erreur.
2. Connecté comme un **élève** (jeton réel) :
   - `update ink_wallets set granted_total = 999999` → refusé ;
   - `insert into products …`, `update products …` → refusés ;
   - `select fulfill_purchase(…)` → refusé ; `select admin_grant_ink(…)` → refusé ;
   - créer un 2ᵉ cahier personnel → erreur `NB001` ; supprimer le premier puis
     recréer → toujours `NB001` ;
   - avec un solde ramené à quelques unités, enregistrer une page plus longue →
     erreur `IK001`, et la page garde son ancien contenu ;
   - lire ses anciens cahiers avec un solde nul → fonctionne.
3. Connecté comme **administrateur** : créer un produit, changer son prix →
   deux lignes dans `product_price_history` avec votre identifiant ; les achats
   existants gardent leur prix.
4. Un compte **créé après** la migration reçoit le portefeuille de départ ; un
   compte **existant** garde tous ses cahiers.
5. Le webhook rejoué deux fois ne crédite qu'une fois.

## Ce qui peut encore se contourner, ou qui reste à décider

- **Comptes en série.** Chaque compte reçoit la réserve de départ et un cahier
  gratuit. La connexion Discord rend cela moins trivial, pas impossible.
- **Ce qui n'est pas mesuré.** Les titres de page et de cahier, les réponses aux
  exercices, les questions posées au professeur et la bio de profil n'utilisent
  pas d'encre (les bloquer empêcherait de rendre un travail ou de poser une
  question). Dites-moi si vous voulez les inclure.
- **Pages vides.** Créer une page blanche ne coûte rien (ce n'est pas du contenu).
- **Mesure à la sauvegarde.** Le serveur voit le contenu tous les ~1 s : remplacer
  un texte par un texte de même longueur ne coûte pas ; effacer puis retaper entre
  deux sauvegardes non plus. L'écart est faible et ne profite à personne en gros.
- **Mode démonstration.** Il reproduit les règles mais n'est **pas sécurisé**
  (tout vit dans le navigateur) et ne peut **jamais** acheter. Ne pas l'utiliser en
  production.

## Mineurs, paiement et droit : à faire valider avant d'ouvrir

Je ne suis pas juriste. Ces points demandent un avis, notamment parce que
l'écriture — fonction centrale du site — devient payante pour un public en
grande partie mineur :

- **Capacité de l'acheteur.** Un mineur ne conclut généralement pas seul un
  contrat de vente. Prévoir un achat par un parent ou tuteur (ou son accord
  explicite) et le dire clairement dans les conditions.
- **Données de mineurs.** Le RGPD fixe à 15 ans en France l'âge du consentement
  numérique seul. Vérifier la base légale, l'information et les durées de
  conservation (les achats se conservent aussi pour la comptabilité).
- **Droit de rétractation (14 jours)** pour une vente à distance, et sa renonciation
  expresse quand le contenu numérique est consommé aussitôt : à recueillir
  explicitement avant paiement.
- **Statut de vendeur.** Identité, mentions légales, CGV, TVA, déclaration de
  l'activité, factures.
- **Règles de Roblox.** Je n'ai pas vérifié si vendre un service lié à un serveur
  de jeu y est permis. Les Robux ne sont pas un moyen de paiement ici.
- **Équité pédagogique.** Faire payer pour pouvoir prendre des notes en cours
  peut être mal reçu par des familles ou des établissements. Choix commercial
  assumé, mais à peser.

## Ce que vous pouvez régler sans toucher au code

*Administration › Boutique* : produits (prix, quantité d'encre ou de cahiers,
mise en vente / retrait), réglages (réserve de départ, coût d'un caractère, d'un
tracé, d'une image ; cahiers offerts ; rôles exemptés ; ouverture de la vente),
soldes et cahiers de chaque compte, achats, historique des prix.
