# Interface — audit et architecture (27 septembre)

## 1. Audit

| Zone | État | Problème |
|---|---|---|
| Salle | Scène bureau réussie (pupitre, sac, cahier, tableau) | Référence visuelle. Personnes en gros avatars ; estrade trop figurative. |
| Châssis | Rail de 14 liens + barre d'outils | Tableau de bord de SaaS : on « navigue dans un site ». |
| Accueil | Cartes « Bonjour, élève », classes, annonces | Vocabulaire scolaire, aucun objet, aucun bureau. |
| Fenêtre flottante | Déplace l'application entière dans le PiP | L'interface complète écrasée (captures : dock coupé, scène illisible). |
| Console d'à-côté | 5 menus texte | Menus déroulants, pas d'objets ; doublon du rail. |
| Densités | 4 niveaux CSS | Réduisent, ne changent pas de comportement. |
| Mes affaires / Papiers / Cahiers | Listes et cartes | Pages de site, hors du monde. |

## 2. Architecture

```
ESPACE ACTUEL        « Chez moi » · « Salle — Session 01 » · « Réunion »…
      ↓              (barre de contexte, en haut, une ligne)
BUREAU               la scène : pupitre, sac, objets posés (chez soi ou en salle)
      ↓
OBJETS               sac · cahier · stylo · feuilles · dossiers
      ↓
ACTIONS              barre d'actions, en bas, toujours là
```

- **Barre de contexte** (haut) : où je suis, présence du responsable, `👥 n`, notifications, réglages. Rien d'autre.
- **Barre d'actions** (bas), identique partout : **Bureau · Sac · Cahier · Note · Documents · Personnes**, puis les gestes du contexte (tableau, main levée, outils du responsable). Le reste de l'application (espaces, archives, bibliothèque, administration, profil) est rangé dans **⋯**.
- **Chez moi** remplace l'accueil : le même bureau que la salle, dans la chambre du personnage. On prépare son sac en sortant et rangeant les objets, physiquement.
- **Taille → comportement** (et non taille → zoom) :

| Taille | Seuil | Comportement |
|---|---|---|
| `grand` | ≥ 1000 × 640 | scène complète |
| `moyen` | ≥ 720 | scène allégée, barre complète |
| `compact` | ≥ 380 × 360 | **console** : un panneau à la fois (bureau, sac, cahier, note, documents, personnes) au-dessus de la barre |
| `mini` | en dessous | la barre seule ; un panneau s'ouvre en surimpression |

La fenêtre détachée au-dessus de Roblox tombe naturellement en `compact` / `mini`.

## 3. Système visuel

- **Graphite** (fonds), **argent brossé** (cadres, séparateurs, boutons, commandes), **blanc cassé** (texte, papier), **bronze ancien** en touche rare (état actif important).
- Bois et papier réservés aux **objets** : le pupitre, le cahier, les feuilles. L'interface est en métal, le monde est en matière.
- Animations ≤ 250 ms, une seule courbe.

## 4. Règles de jeu conservées

Pas d'outil en main → pas d'écriture. Un objet oublié reste où il est. La proximité est attestée, jamais détectée.
