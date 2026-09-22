-- ============================================================================
-- OJM ACADEMY — Ouverture de la plateforme
-- Migration 0007
--
-- La plateforme n'est plus réservée à un établissement : n'importe quel
-- inscrit peut ouvrir son propre espace. On ne naît pas professeur, on le
-- devient en créant une classe — le déclencheur classes_add_owner inscrit
-- déjà le créateur comme « teacher » de la sienne.
--
-- Le rôle global ne sert donc plus qu'à l'administration de la plateforme et
-- à la présentation. C'est le rôle *dans la classe* qui décide de tout.
-- ============================================================================

-- Le rôle de base peut créer et administrer ses propres espaces.
insert into role_permissions (role_key, permission_key)
select 'student', p
  from unnest(array[
    'CREATE_CLASS',          -- ouvrir sa classe ou son groupe
    'MANAGE_CLASS',          -- l'administrer une fois créée
    'MANAGE_MEMBERS',
    'VIEW_STUDENTS',
    'CREATE_COURSE',
    'RUN_SESSION',
    'EDIT_SHARED_NOTEBOOK',
    'USE_BOARD',
    'CREATE_EXERCISE',
    'GRADE_EXERCISE',
    'UPLOAD_DOCUMENT',
    'TAKE_ATTENDANCE',
    'PUBLISH_ANNOUNCEMENT',
    'RUN_POLL'
  ]) p
on conflict (role_key, permission_key) do nothing;

-- Rappel : ces permissions sont *globales*. Ce qui protège réellement une
-- classe, ce sont les politiques RLS, qui vérifient l'appartenance et le rôle
-- au sein de cette classe précise (app_is_staff, app_can_write_class…).
-- Pouvoir « créer un exercice » ne permet d'en créer que dans les classes que
-- l'on encadre : la politique exercises_write l'exige.

-- Le libellé du rôle de base ne dit plus « élève » : sur cette plateforme,
-- on est tour à tour élève et animateur.
update roles
   set label = 'Membre',
       description = 'Rejoint des espaces et crée les siens'
 where key = 'student';
