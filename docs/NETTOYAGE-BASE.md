# Nettoyage de la base : ce qui reste après le retrait des objets

Le site n'utilise plus les objets, le sac, les papiers remis en main propre, les
fiches de personnage, le livret, le classement ni les annotations de marge. Pour
ne rien risquer, **la migration `0040` ne supprime aucune table ni aucune ligne** :
elle referme seulement les accès (voir son en-tête). Ces tables existent toujours,
inertes.

## Ce qui a changé, et pourquoi c'est sans danger pour les données

- `notebooks` et `notebook_pages` : **aucune colonne retirée, aucune ligne touchée.**
  Les colonnes `support`, `max_pages`, `place`, `container_id`… ne sont plus lues
  ni écrites ; elles sont ignorées.
- Un cahier « laissé en salle » ou « rangé dans un sac » reste lisible et modifiable
  par son propriétaire (côté base, la lecture ne dépendait déjà que de `owner_id`).
- Le garde `notebooks_garde_du_lieu` est supprimé, pour qu'aucun cahier ne reste
  bloqué par un lieu que plus aucun écran ne sait corriger.
- Les lignes de `class_bags` ne donnent **plus** à l'encadrement l'accès aux cahiers
  des élèves. C'est un resserrement volontaire : sans lui, d'anciennes lignes
  auraient ouvert ces cahiers pour toujours.

## Tables devenues inertes

`belongings`, `belonging_handoffs`, `class_bags`, `supply_blocks`, `papers`,
`paper_handoffs`, `notebook_handoffs`, `page_annotations`, `rp_profiles`,
`service_records`, `dossier_items`.

Si un jour vous voulez les supprimer :

1. **Sauvegardez** la base (export complet) et gardez-la.
2. Vérifiez qu'aucune table conservée ne les référence encore :
   ```sql
   select conrelid::regclass as table_dependante, confrelid::regclass as table_visee
     from pg_constraint
    where contype = 'f'
      and confrelid::regclass::text in (
        'belongings','belonging_handoffs','class_bags','supply_blocks','papers',
        'paper_handoffs','notebook_handoffs','page_annotations','rp_profiles',
        'service_records','dossier_items');
   ```
3. Retirez-les **une par une**, jamais en une seule fois, en lisant l'erreur éventuelle.
   Le retrait est **irréversible** : les objets, papiers et fiches des joueurs
   disparaissent pour de bon.

Rien ne presse : elles n'ont aucun effet tant qu'on ne les lit pas.

## Bucket de stockage

Les papiers pouvaient porter des fichiers. Le seau `documents` reste utilisé par
les documents de classe ; ne le purgez pas sans avoir listé ce qui en dépend.
