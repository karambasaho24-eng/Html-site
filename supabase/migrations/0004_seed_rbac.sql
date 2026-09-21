-- ============================================================================
-- OJM ACADEMY — Référentiel des rôles et permissions
-- Migration 0004
-- ============================================================================

insert into roles (key, label, rank, description) values
  ('super_admin', 'Super administrateur', 100, 'Contrôle total de la plateforme'),
  ('admin',       'Administrateur',        90, 'Administration et modération'),
  ('director',    'Directeur',             80, 'Direction de l''académie'),
  ('teacher',     'Professeur',            60, 'Enseigne et gère ses classes'),
  ('instructor',  'Formateur',             50, 'Anime des formations'),
  ('student',     'Élève',                 20, 'Suit les cours et prend des notes'),
  ('observer',    'Observateur',           10, 'Consulte sans intervenir')
on conflict (key) do update
  set label = excluded.label, rank = excluded.rank, description = excluded.description;

insert into permissions (key, label, category) values
  ('CREATE_CLASS',          'Créer une classe',                 'classe'),
  ('MANAGE_CLASS',          'Administrer une classe',           'classe'),
  ('VIEW_STUDENTS',         'Voir la liste des élèves',         'classe'),
  ('MANAGE_MEMBERS',        'Gérer les membres',                'classe'),
  ('CREATE_COURSE',         'Créer un cours',                   'cours'),
  ('RUN_SESSION',           'Animer une session',               'cours'),
  ('EDIT_SHARED_NOTEBOOK',  'Écrire dans le cahier commun',     'cahier'),
  ('READ_SHARED_NOTEBOOK',  'Lire le cahier commun',            'cahier'),
  ('USE_NOTEBOOK',          'Utiliser son cahier personnel',    'cahier'),
  ('USE_BOARD',             'Écrire au tableau',                'tableau'),
  ('VIEW_BOARD',            'Voir le tableau',                  'tableau'),
  ('CREATE_EXERCISE',       'Créer un exercice',                'exercice'),
  ('ANSWER_EXERCISE',       'Répondre à un exercice',           'exercice'),
  ('GRADE_EXERCISE',        'Corriger un exercice',             'exercice'),
  ('UPLOAD_DOCUMENT',       'Importer un document',             'document'),
  ('VIEW_DOCUMENT',         'Consulter les documents',          'document'),
  ('TAKE_ATTENDANCE',       'Gérer les présences',              'classe'),
  ('PUBLISH_ANNOUNCEMENT',  'Publier une annonce',              'classe'),
  ('ASK_QUESTION',          'Poser une question',               'session'),
  ('RAISE_HAND',            'Lever la main',                    'session'),
  ('RUN_POLL',              'Lancer un sondage',                'session'),
  ('VIEW_ARCHIVES',         'Consulter les archives',           'archives'),
  ('MANAGE_USERS',          'Gérer les comptes',                'administration'),
  ('VIEW_LOGS',             'Consulter les journaux',           'administration'),
  ('MODERATE',              'Modérer la plateforme',            'administration')
on conflict (key) do update set label = excluded.label, category = excluded.category;

-- Attributions ---------------------------------------------------------------
delete from role_permissions;

-- Super admin et admin : tout
insert into role_permissions (role_key, permission_key)
select r.key, p.key from roles r cross join permissions p
 where r.key in ('super_admin', 'admin');

-- Directeur : tout sauf la gestion technique des comptes
insert into role_permissions (role_key, permission_key)
select 'director', key from permissions where key <> 'MANAGE_USERS';

-- Professeur / formateur
insert into role_permissions (role_key, permission_key)
select r, p from unnest(array['teacher', 'instructor']) r
cross join unnest(array[
  'CREATE_CLASS','MANAGE_CLASS','VIEW_STUDENTS','MANAGE_MEMBERS',
  'CREATE_COURSE','RUN_SESSION','EDIT_SHARED_NOTEBOOK','READ_SHARED_NOTEBOOK',
  'USE_NOTEBOOK','USE_BOARD','VIEW_BOARD','CREATE_EXERCISE','GRADE_EXERCISE',
  'UPLOAD_DOCUMENT','VIEW_DOCUMENT','TAKE_ATTENDANCE','PUBLISH_ANNOUNCEMENT',
  'RUN_POLL','VIEW_ARCHIVES','VIEW_LOGS'
]) p;

-- Élève
insert into role_permissions (role_key, permission_key)
select 'student', p from unnest(array[
  'USE_NOTEBOOK','READ_SHARED_NOTEBOOK','VIEW_BOARD','ANSWER_EXERCISE',
  'VIEW_DOCUMENT','ASK_QUESTION','RAISE_HAND','VIEW_ARCHIVES'
]) p;

-- Observateur : lecture seule
insert into role_permissions (role_key, permission_key)
select 'observer', p from unnest(array[
  'READ_SHARED_NOTEBOOK','VIEW_BOARD','VIEW_DOCUMENT','VIEW_ARCHIVES'
]) p;
