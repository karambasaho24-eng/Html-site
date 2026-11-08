# Encre, cahiers et commandes — le paiement se fait en jeu

**Le site ne traite aucun paiement.** Pour obtenir de l'encre ou un cahier
supplémentaire, l'élève envoie une **missive de commande** (logo : un pigeon
voyageur). Il paie **en jeu**, se tient **à proximité**, et le **PDG livre** la
commande une fois payé. Cette livraison — un clic du PDG — est le **seul** geste qui
crédite de l'encre ou un droit de cahier. Rien d'autre ne le fait, ni le site, ni
l'élève.

```
Élève ── missive de commande ──▶ commande « en attente » (prix et quantités COPIÉS)
Élève ── paie en jeu, reste à proximité
PDG   ── vérifie le paiement en jeu ──▶ « Livrer » ──▶ encre / droit de cahier crédités
                                    └─▶ « Refuser » (motif visible de l'élève)
```

## Les règles (migrations `0039`, `0040`, `0041`)

| Règle | Où elle est appliquée |
|---|---|
| Chaque compte a une réserve d'encre ; écrire la fait baisser | déclencheurs sur `notebook_pages`, `sticky_notes`, `board_elements` |
| Sans encre, toute nouvelle écriture est refusée (`IK001`) ; la lecture n'est jamais touchée | `app_debiter_encre()` |
| Premier cahier gratuit, les suivants se commandent (`NB001`) | déclencheur sur `notebooks` ; droit mesuré aux cahiers **jamais créés** : supprimer ne rend rien |
| **Un cahier est plein à N pages** (`PG001`) — **N réglable, 0 = aucune limite** | déclencheur sur `notebook_pages` (réglage `max_pages`, 10 par défaut) |
| Réserve de départ **petite et réglable** | réglage `starter_ink` (3 000 caractères par défaut) |
| Le navigateur ne peut écrire ni son solde, ni ses droits, ni un prix | aucune politique d'écriture ; droits retirés |
| Seul le PDG ou un super administrateur **livre** une commande | `admin_livrer_commande()` : permission `MANAGE_SHOP` vérifiée dans la fonction |
| Livrer deux fois ne crédite pas deux fois | la fonction est idempotente |
| Le prix est relu en base ; la commande en garde une **copie** | `passer_commande()` ; changer un prix ne touche jamais une commande passée |
| Historique daté des prix, avec l'administrateur responsable | déclencheur sur `products` |
| Une missive par article en attente, trois au plus ; l'élève peut retirer la sienne | `passer_commande()`, `annuler_commande()` |

Les exemptés (par défaut : PDG, super administrateurs, administrateurs, directeurs,
professeurs, formateurs) n'ont ni encre, ni quota de cahiers, ni limite de pages.

## Ce que le PDG règle, sans toucher au code (*Administration › Boutique*)

- **Commandes** : les missives à livrer (nom de l'élève, article, prix, son message),
  « Livrer — payé en jeu » / « Refuser », et les commandes déjà traitées.
- **Articles** : nom, prix, quantité d'encre ou de cahiers, mise en vente ou retrait.
- **Réglages** : réserve de départ, **pages par cahier**, cahiers offerts, coût de
  l'encre (caractère, tracé, image), monnaie du jeu (code de trois lettres), rôles
  exemptés, ouverture ou fermeture des commandes.
- **Comptes** : solde d'encre et cahiers de chacun ; « Encre… » et « Cahiers… » pour
  donner ou retirer à la main (inscrit au journal).
- **Historique des prix**.

L'unité de la monnaie est libre (20 caractères au plus) et vide par défaut : le PDG la
définit dans Administration › Boutique › Monnaie du jeu. Les prix sont des entiers sans
centimes. Une monnaie réelle (`EUR`…) se compte en centimes.

## Les rôles : PDG et super administrateurs

- **PDG** : le fondateur. Tous les droits ; le seul à nommer ou destituer un super
  administrateur ; **intouchable** par les autres comptes (ni supprimé, ni sanctionné,
  ni rétrogradé, ni code de rôle fabriqué pour le remplacer).
- **Super administrateur** : tout, sauf ce qui touche au PDG et à ses pairs. Règle la
  boutique avec le PDG.
- Les administrateurs simples ne règlent **plus** la boutique.

**Devenir PDG** : inscrivez votre identifiant Discord dans la table `admins_discord`
avec le rôle `pdg` (voir `0035_admins_discord.sql`) ; vous le serez à la prochaine
connexion Discord. Ou, depuis l'éditeur SQL :
`update profiles set role_key = 'pdg' where id = '<votre-id>';`

Limite connue : la remise à zéro générale (`reinitialiser_tout`, `0037`) reste réservée
aux comptes `super_admin` et n'a pas été étendue au PDG ; elle se lance depuis
l'éditeur SQL.

## Vérifier sur une vraie base, avant d'ouvrir aux élèves

Les migrations n'ont **jamais été exécutées** par leur auteur (pas de PostgreSQL dans
son environnement) ; `node outils/essais.mjs` éprouve l'interface et le pilote local,
qui reproduit les règles — **pas** la sécurité côté serveur. Sur une copie de la base :

1. `0039`, `0040`, `0041` passent dans l'ordre, sans erreur, et se rejouent sans erreur.
2. Connecté comme un **élève** (jeton réel), constatez que ceci est **refusé** :
   `update ink_wallets set granted_total = 999999` ; `insert/update products` ;
   `select admin_livrer_commande(…)` ; `select admin_grant_ink(…)` ;
   `select admin_set_setting('max_pages', 9999)` ; 2ᵉ cahier personnel (`NB001`),
   y compris après suppression du premier ; 4ᵉ page d'un cahier limité à 3 (`PG001`) ;
   écriture sans encre (`IK001`, la page garde son ancien contenu).
3. Avec un solde nul, un élève **lit** encore tous ses anciens cahiers.
4. Comme PDG : créer un article, changer son prix → deux lignes dans
   `product_price_history` avec votre identifiant ; une commande déjà passée garde son
   prix ; « Livrer » crédite **une fois** même cliqué deux fois.
5. Comme **super administrateur** : changer le rôle du PDG, le supprimer, le
   sanctionner, créer un code de rôle « super administrateur » → tout est refusé.
6. Un compte **créé après** les migrations reçoit la réserve de départ ; un compte
   **existant** garde tous ses cahiers et reçoit aussi la réserve de départ.

## Ce que le site ne peut pas faire

- **Vérifier le paiement ni la proximité.** Tout se passe dans Roblox : c'est le PDG
  qui constate le paiement et la présence de l'élève avant de cliquer « Livrer ». Le
  clic ne s'annule pas (corrigez une erreur avec *Comptes › Encre…* / *Cahiers…*).
- **Garantir que l'élève a payé.** Aucune intégration avec Roblox n'existe.

## Points à vérifier avant d'ouvrir

Je ne suis pas juriste, et je n'ai pas lu les conditions de Roblox :

- **Comment l'élève paie en jeu**, concrètement (Robux, monnaie du serveur, objet…), et
  si ce mécanisme est **permis par les conditions de Roblox**. Ne jamais accepter de
  l'argent réel hors plateforme sans l'avoir vérifié. C'est le point le plus important.
- **Faire payer l'écriture à des mineurs** : à examiner même sans paiement sur le site
  (information des familles, usage proportionné, équité entre élèves).
- **Données de mineurs** (RGPD, 15 ans en France) : base légale et information.
- **Équité pédagogique** : faire payer pour pouvoir prendre des notes en cours peut
  être mal reçu ; choix commercial assumé, à peser.

## Ce qui peut encore se contourner

- **Comptes en série** : chaque compte reçoit la réserve de départ et un cahier gratuit.
  Réduisez la réserve de départ (réglage) pour que cela ne rapporte rien ; la connexion
  Discord rend la chose moins triviale, pas impossible.
- **Non mesuré** : titres de page et de cahier, réponses aux exercices, questions au
  professeur, bio de profil. Créer une page blanche est gratuit (dans la limite de pages).
- **Mesure à la sauvegarde** : le serveur voit le contenu environ toutes les secondes ;
  remplacer un texte par un texte de même longueur ne coûte pas.
- **Mode démonstration** : reproduit les règles mais ne protège rien (tout vit dans le
  navigateur). Ne pas l'utiliser en production.
