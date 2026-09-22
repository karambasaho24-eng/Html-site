# Architecture

## Principe directeur

Roblox porte le RolePlay. Le site porte l'école. Rien de ce qui peut vivre ici
ne doit peser là-bas : le tableau, les cahiers, les documents, les exercices,
les présences et les archives sont entièrement externalisés.

Il n'y a donc **aucune intégration technique avec Roblox** — pas d'injection,
pas de modification du client, pas de fausse passerelle. Le lien entre les deux
mondes est humain : un code de classe annoncé en jeu, et un pseudo Roblox
renseigné sur le profil pour que le professeur fasse la correspondance.

## Pourquoi pas de framework

Le site est écrit en HTML, CSS et modules ES natifs, sans étape de compilation.

- il se dépose tel quel sur n'importe quel hébergement statique ;
- il reste lisible et modifiable par une personne seule, des années plus tard ;
- il n'y a pas de chaîne d'outils à maintenir ni à mettre à jour ;
- les seules bibliothèques utilisées (supabase-js, pdf.js) sont livrées avec le
  site dans `vendor/`, sans dépendance à un CDN tiers à l'exécution.

Le prix à payer : pas de rendu incrémental. Les vues sont reconstruites quand
leur état change. À cette échelle, c'est imperceptible et bien plus simple à
suivre qu'un arbre virtuel.

## Couches

```
        vues/            un écran, une fonction qui renvoie un nœud
          │
        features/        éditeur de cahier · moteur de tableau ·
          │              exercice en direct · conversion de documents
          │
        data/index.js    façade : classes, cahiers, sessions, exercices…
          │
   ┌──────┴───────┐
 supabase.js    local.js       deux pilotes, une seule interface
   │              │
 Postgres      localStorage
 Realtime      BroadcastChannel
 Storage       IndexedDB
```

Aucune vue n'importe un pilote. Elles passent toutes par `src/data/index.js`,
ce qui permet de changer de socle sans toucher à l'interface — et de faire
tourner l'application sans serveur pour les essais.

### Le pilote local

`src/data/local.js` réimplémente le contrat complet dans le navigateur :
collections dans `localStorage`, fichiers dans IndexedDB, temps réel via
`BroadcastChannel`, et une version JavaScript de chaque procédure SQL. La
session vit dans `sessionStorage`, si bien que deux onglets du même poste
peuvent ouvrir deux comptes différents et se synchroniser — c'est ce qui rend
la démonstration professeur / élève possible sur une seule machine.

Il n'offre **aucune sécurité** : il n'y a ni RLS ni contrôle serveur.
L'interface l'indique en permanence dans la barre supérieure.

## Temps réel

Deux canaux, jamais plus, et toujours filtrés :

| Canal              | Portée                              | Contenu |
|--------------------|-------------------------------------|---------|
| `session:<id>`     | une session de classe               | session, mains, questions, sondages, minuteries, annonces, exercices, présences, pages de tableau |
| `tableau:<pageId>` | une page de tableau                 | éléments tracés |

Les abonnements `postgres_changes` portent un filtre serveur
(`session_id=eq.…`, `page_id=eq.…`) : la classe B ne reçoit jamais les
événements de la classe A. Le canal du tableau est recréé à chaque changement
de page, pour ne pas écouter ce qui n'est pas affiché.

Deux mécanismes se complètent :

- **diffusion** (`broadcast`) pour ce qui doit être instantané et n'a pas à
  être conservé : fragments de tracé pendant le geste, position des curseurs,
  changement de page affichée ;
- **`postgres_changes`** pour ce qui est durable : un tracé terminé devient une
  ligne de `board_elements`, et c'est cette ligne qui fait foi.

Un élève qui arrive en retard recharge simplement les éléments de la page : il
voit exactement le même tableau que les autres.

## Le tableau

Résolution logique fixe de 1600 × 900, mise à l'échelle par CSS. Le même tracé
s'affiche donc à l'identique sur tous les écrans — indispensable pour un
tableau partagé, où une différence de rendu vaudrait un malentendu.

Chaque élément (trait, forme, texte, image) est une ligne, avec son auteur et
son ordre d'empilement. La gomme marque `deleted = true` plutôt que de
supprimer : l'historique d'une séance reste reconstituable.

La capture transforme l'état courant en image et l'attache à une page du cahier
commun (`capture_board_page`). Le tableau peut ensuite être effacé sans perte.

## Sécurité

### La base fait autorité

Chaque table porte ses politiques RLS. Les vérifications de
`src/core/permissions.js` ne servent qu'à masquer ce qui n'a pas lieu d'être
affiché — elles ne protègent rien.

Les politiques s'appuient sur des fonctions `SECURITY DEFINER`
(`app_is_member`, `app_is_staff`, `app_can_draw_board`…). Ce n'est pas un
raccourci : sans elles, la politique de `class_members` relirait
`class_members` à travers RLS, et Postgres refuserait la récursion.

### Ce que le linter Supabase signale, et pourquoi

Vingt fonctions `SECURITY DEFINER` restent exécutables par les utilisateurs
connectés. C'est voulu, et c'est le minimum :

- les douze aides `app_*` sont évaluées **par l'appelant** à l'intérieur des
  politiques ; sans droit d'exécution, plus aucune requête ne passerait. Elles
  ne renvoient qu'un booléen ou un identifiant de rattachement ;
- les huit procédures métier (`join_class`, `start_session`, `end_session`…)
  sont l'API de l'application et vérifient elles-mêmes les droits avant d'agir.

Tout le reste — générateur de code, fonctions de déclencheur — a vu ses droits
retirés par la migration `0005` et n'est plus atteignable via l'API.

Reste un réglage à activer à la main dans la console Supabase :
*Authentication › Policies › Leaked password protection* (vérification des mots
de passe compromis auprès de HaveIBeenPwned).

### Contenu saisi par les utilisateurs

Les pages de cahier sont rédigées dans un champ `contenteditable`, stockées en
HTML, puis réaffichées — chez leur auteur comme chez les autres membres de la
classe. Sans filtrage, un élève pourrait exécuter du script dans le navigateur
de son professeur.

`src/core/assainir.js` impose donc une liste blanche stricte de balises,
d'attributs, de protocoles et de propriétés CSS, appliquée à **chaque** passage
de HTML vers le DOM. Le collage est réduit au texte brut, pour qu'aucun balisage
étranger n'entre dans une page.

### Vérification

Le modèle a été éprouvé sur la base réelle, en se faisant passer pour chaque
utilisateur (`set request.jwt.claims`). Dix-neuf assertions, toutes vertes :

- la classe est invisible avant inscription, visible après `join_class` ;
- l'élève ne peut ni modifier la classe, ni se promouvoir, ni ouvrir une
  session, ni régénérer le code ;
- le tableau verrouillé refuse ses tracés ; le mode participatif les accepte ;
- il ne peut pas signer un tracé au nom du professeur ;
- le cahier personnel du professeur et les exercices en brouillon lui restent
  invisibles ;
- `end_session` clôt les présences et calcule le récapitulatif.

C'est ce test qui a révélé que `join_class` échouait systématiquement sur
Postgres : le paramètre de sortie `class_id` entrait en conflit avec la colonne
du même nom dans `on conflict (class_id, user_id)`. Corrigé par la migration
`0006`.

## Base de données

31 tables, 88 politiques. Les groupes principaux :

| Domaine    | Tables |
|------------|--------|
| Identité   | `profiles`, `roles`, `permissions`, `role_permissions` |
| Classes    | `classes`, `class_members`, `class_sessions`, `attendance` |
| Cahiers    | `notebooks`, `notebook_pages` |
| Tableau    | `boards`, `board_pages`, `board_elements` |
| Ressources | `folders`, `documents`, `courses`, `course_items` |
| Évaluation | `exercises`, `exercise_questions`, `exercise_attempts`, `exercise_answers`, `grades` |
| Séance     | `announcements`, `session_questions`, `hands`, `polls`, `poll_votes`, `timers` |
| Transverse | `notifications`, `favorites`, `activity_logs` |

Procédures métier : `join_class`, `start_session`, `check_in`, `end_session`,
`notify_class`, `capture_board_page`, `autograde_attempt`,
`regenerate_class_code`.

Deux déclencheurs font le travail invisible : un code de classe est attribué à
l'insertion, et le créateur devient professeur de sa propre classe.

## Coupures réseau

Le temps réel exige une liaison — l'interface ne prétend jamais le contraire.
Mais une coupure ne doit pas coûter une page de notes :

- l'écriture d'une page de cahier est différée (900 ms) ; si l'envoi échoue,
  le contenu part dans un brouillon local et l'étiquette passe à
  « non enregistré » ;
- les notes personnelles de séance ne quittent jamais le poste tant que l'élève
  ne les verse pas dans un cahier ;
- la barre supérieure affiche l'état réel de la liaison, et le retour du réseau
  est annoncé.

## Points à connaître

- **Le cahier commun n'est pas collaboratif au caractère près.** Deux personnes
  écrivant la même page au même instant : la dernière écriture gagne. L'éditeur
  refuse d'écraser une saisie en cours et prévient l'auteur. Une fusion fine
  (CRDT) serait un chantier à part entière.
- **La conversion de PDF rend des images**, pas du texte sélectionnable. C'est
  le choix qui évite toute dépendance à un service d'analyse payant.
- **`activity_logs` grossit avec l'usage.** Une purge périodique des entrées de
  plus de quelques mois est à prévoir si l'académie tourne longtemps.
