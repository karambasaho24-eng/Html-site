-- ============================================================================
-- OJM ACADEMY — Schéma principal
-- Plateforme scolaire RP parallèle à Roblox.
-- Migration 0001 : types, tables, index, déclencheurs.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
do $$ begin
  create type member_role   as enum ('teacher', 'assistant', 'student', 'observer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_status as enum ('pending', 'active', 'banned', 'left');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status as enum ('planned', 'live', 'ended', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type presence_state as enum ('present', 'away', 'absent', 'offline');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notebook_kind as enum ('personal', 'shared', 'library');
exception when duplicate_object then null; end $$;

do $$ begin
  create type board_mode as enum ('locked', 'participative', 'open');
exception when duplicate_object then null; end $$;

do $$ begin
  create type exercise_status as enum ('draft', 'live', 'closed', 'graded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type question_kind as enum (
    'free', 'qcm', 'single', 'multiple', 'truefalse',
    'fill', 'ordering', 'matching', 'case', 'situation'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type attempt_status as enum ('started', 'submitted', 'graded', 'void');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Rôles & permissions (RBAC global)
-- ---------------------------------------------------------------------------
create table if not exists roles (
  key         text primary key,
  label       text not null,
  rank        int  not null default 0,
  description text
);

create table if not exists permissions (
  key      text primary key,
  label    text not null,
  category text not null default 'general'
);

create table if not exists role_permissions (
  role_key       text references roles(key) on delete cascade,
  permission_key text references permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Nouvel élève',
  roblox_name  text,
  avatar_url   text,
  role_key     text not null default 'student' references roles(key),
  rp_rank      text,
  bio          text,
  preferences  jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Classes
-- ---------------------------------------------------------------------------
create table if not exists classes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  subject     text,
  level       text,
  color       text not null default 'olive',
  icon        text not null default 'scales',
  owner_id    uuid not null references profiles(id) on delete cascade,
  locked      boolean not null default false,
  join_open   boolean not null default true,
  require_approval boolean not null default false,
  archived    boolean not null default false,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists classes_owner_idx on classes(owner_id);
create index if not exists classes_code_idx  on classes(code);

create table if not exists class_members (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references classes(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        member_role   not null default 'student',
  status      member_status not null default 'active',
  muted       boolean not null default false,
  grants      jsonb not null default '[]'::jsonb,
  joined_at   timestamptz not null default now(),
  unique (class_id, user_id)
);
create index if not exists class_members_user_idx  on class_members(user_id);
create index if not exists class_members_class_idx on class_members(class_id);

-- ---------------------------------------------------------------------------
-- Sessions de cours
-- ---------------------------------------------------------------------------
create table if not exists class_sessions (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes(id) on delete cascade,
  course_id    uuid,
  title        text not null default 'Session',
  number       int  not null default 1,
  status       session_status not null default 'planned',
  follow_mode  boolean not null default false,
  focus        jsonb not null default '{}'::jsonb,   -- { kind, ref, page }
  summary      jsonb not null default '{}'::jsonb,
  started_at   timestamptz,
  ended_at     timestamptz,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists class_sessions_class_idx on class_sessions(class_id, created_at desc);

create table if not exists attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references class_sessions(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  status      presence_state not null default 'present',
  arrived_at  timestamptz not null default now(),
  left_at     timestamptz,
  seconds     int not null default 0,
  manual      boolean not null default false,
  note        text,
  unique (session_id, user_id)
);
create index if not exists attendance_session_idx on attendance(session_id);

-- ---------------------------------------------------------------------------
-- Cahiers
-- ---------------------------------------------------------------------------
create table if not exists notebooks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references profiles(id) on delete cascade,
  class_id   uuid references classes(id) on delete cascade,
  kind       notebook_kind not null default 'personal',
  title      text not null default 'Nouveau cahier',
  subtitle   text,
  cover      text not null default 'parchment',
  color      text not null default 'olive',
  icon       text not null default 'book',
  collaborative boolean not null default false,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notebooks_owner_idx on notebooks(owner_id);
create index if not exists notebooks_class_idx on notebooks(class_id);

create table if not exists notebook_pages (
  id          uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks(id) on delete cascade,
  position    int  not null default 0,
  title       text not null default 'Page',
  body        text not null default '',
  drawing     jsonb,
  attachments jsonb not null default '[]'::jsonb,
  origin      text not null default 'manual',   -- manual | board | document | course
  origin_ref  uuid,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists notebook_pages_nb_idx on notebook_pages(notebook_id, position);

-- ---------------------------------------------------------------------------
-- Tableau interactif
-- ---------------------------------------------------------------------------
create table if not exists boards (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes(id) on delete cascade,
  session_id   uuid references class_sessions(id) on delete cascade,
  title        text not null default 'Tableau',
  mode         board_mode not null default 'locked',
  allowed      jsonb not null default '[]'::jsonb,  -- uuid[] autorisés en mode participatif
  current_page int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists boards_class_idx on boards(class_id);

create table if not exists board_pages (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references boards(id) on delete cascade,
  position   int not null default 0,
  title      text not null default 'Tableau 1',
  background text not null default 'slate',
  created_at timestamptz not null default now()
);
create index if not exists board_pages_board_idx on board_pages(board_id, position);

create table if not exists board_elements (
  id       uuid primary key default gen_random_uuid(),
  page_id  uuid not null references board_pages(id) on delete cascade,
  kind     text not null,              -- stroke | line | rect | ellipse | text | image
  data     jsonb not null,
  author_id uuid references profiles(id) on delete set null,
  z        int not null default 0,
  deleted  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists board_elements_page_idx on board_elements(page_id, z);

-- ---------------------------------------------------------------------------
-- Documents & bibliothèque
-- ---------------------------------------------------------------------------
create table if not exists folders (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid references profiles(id) on delete cascade,
  class_id  uuid references classes(id) on delete cascade,
  parent_id uuid references folders(id) on delete cascade,
  name      text not null,
  icon      text not null default 'folder',
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references profiles(id) on delete cascade,
  class_id     uuid references classes(id) on delete cascade,
  folder_id    uuid references folders(id) on delete set null,
  title        text not null,
  kind         text not null default 'pdf',  -- pdf | image | text | link
  storage_path text,
  external_url text,
  size_bytes   bigint,
  page_count   int,
  meta         jsonb not null default '{}'::jsonb,
  shared       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists documents_class_idx on documents(class_id);
create index if not exists documents_owner_idx on documents(owner_id);

-- ---------------------------------------------------------------------------
-- Cours préparés (déroulé) & modèles
-- ---------------------------------------------------------------------------
create table if not exists courses (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid references classes(id) on delete cascade,
  owner_id    uuid references profiles(id) on delete cascade,
  title       text not null,
  description text,
  is_template boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists course_items (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  position  int not null default 0,
  kind      text not null,        -- page | document | exercise | board | note
  ref_id    uuid,
  title     text not null default 'Étape',
  payload   jsonb not null default '{}'::jsonb
);
create index if not exists course_items_course_idx on course_items(course_id, position);

-- ---------------------------------------------------------------------------
-- Exercices
-- ---------------------------------------------------------------------------
create table if not exists exercises (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes(id) on delete cascade,
  session_id   uuid references class_sessions(id) on delete set null,
  course_id    uuid references courses(id) on delete set null,
  author_id    uuid references profiles(id) on delete set null,
  title        text not null,
  instructions text,
  status       exercise_status not null default 'draft',
  exam_mode    boolean not null default false,
  duration_sec int,
  opened_at    timestamptz,
  closed_at    timestamptz,
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists exercises_class_idx on exercises(class_id, created_at desc);

create table if not exists exercise_questions (
  id          uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references exercises(id) on delete cascade,
  position    int not null default 0,
  kind        question_kind not null default 'free',
  prompt      text not null default '',
  helper      text,
  options     jsonb not null default '[]'::jsonb,
  solution    jsonb,
  points      numeric(6,2) not null default 1
);
create index if not exists exercise_questions_ex_idx on exercise_questions(exercise_id, position);

create table if not exists exercise_attempts (
  id          uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references exercises(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  status      attempt_status not null default 'started',
  score       numeric(6,2),
  max_score   numeric(6,2),
  feedback    text,
  graded_by   uuid references profiles(id) on delete set null,
  started_at  timestamptz not null default now(),
  submitted_at timestamptz,
  graded_at   timestamptz,
  unique (exercise_id, user_id)
);
create index if not exists attempts_ex_idx on exercise_attempts(exercise_id);

create table if not exists exercise_answers (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references exercise_attempts(id) on delete cascade,
  question_id uuid not null references exercise_questions(id) on delete cascade,
  response    jsonb,
  score       numeric(6,2),
  correct     boolean,
  feedback    text,
  updated_at  timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table if not exists grades (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references classes(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  source_kind text not null default 'exercise',
  source_id   uuid,
  label       text not null default 'Évaluation',
  score       numeric(6,2) not null,
  max_score   numeric(6,2) not null default 20,
  comment     text,
  graded_by   uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists grades_class_user_idx on grades(class_id, user_id);

-- ---------------------------------------------------------------------------
-- Vie de la session : annonces, questions, mains levées, sondages, minuteries
-- ---------------------------------------------------------------------------
create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references classes(id) on delete cascade,
  session_id uuid references class_sessions(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  title      text not null default 'Annonce',
  body       text not null,
  level      text not null default 'info',   -- info | important | alert
  created_at timestamptz not null default now()
);
create index if not exists announcements_class_idx on announcements(class_id, created_at desc);

create table if not exists session_questions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references class_sessions(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  body        text not null,
  context     text,
  status      text not null default 'open',   -- open | answered | dismissed
  answer      text,
  answered_by uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists session_questions_idx on session_questions(session_id, created_at desc);

create table if not exists hands (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  status     text not null default 'raised',  -- raised | accepted | lowered
  raised_at  timestamptz not null default now(),
  unique (session_id, user_id)
);

create table if not exists polls (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  question   text not null,
  options    jsonb not null default '[]'::jsonb,
  kind       text not null default 'poll',   -- poll | vote
  status     text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists poll_votes (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references polls(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  choice   int not null,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);

create table if not exists timers (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  label      text not null default 'Minuterie',
  kind       text not null default 'countdown',  -- countdown | chrono
  duration_sec int not null default 600,
  state      text not null default 'idle',       -- idle | running | paused | done
  started_at timestamptz,
  elapsed_sec int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists timers_session_idx on timers(session_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Transversal : notifications, favoris, journal, préférences
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  class_id   uuid references classes(id) on delete cascade,
  kind       text not null default 'info',
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);

create table if not exists favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  target_kind text not null,
  target_id   uuid not null,
  label       text,
  created_at  timestamptz not null default now(),
  unique (user_id, target_kind, target_id)
);

create table if not exists activity_logs (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid references classes(id) on delete cascade,
  session_id uuid references class_sessions(id) on delete cascade,
  user_id    uuid references profiles(id) on delete set null,
  action     text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_session_idx on activity_logs(session_id, created_at desc);
create index if not exists activity_logs_user_idx    on activity_logs(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Déclencheurs
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

drop trigger if exists notebooks_touch on notebooks;
create trigger notebooks_touch before update on notebooks
  for each row execute function touch_updated_at();

drop trigger if exists notebook_pages_touch on notebook_pages;
create trigger notebook_pages_touch before update on notebook_pages
  for each row execute function touch_updated_at();

-- Création automatique du profil à l'inscription
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role_key)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Nouvel élève'),
    coalesce(new.raw_user_meta_data->>'role_key', 'student')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Met à jour la durée de présence à la sortie
create or replace function attendance_close() returns trigger
language plpgsql as $$
begin
  if new.left_at is not null and (old.left_at is null or old.left_at <> new.left_at) then
    new.seconds := greatest(0, extract(epoch from (new.left_at - new.arrived_at))::int);
  end if;
  return new;
end $$;

drop trigger if exists attendance_close_trg on attendance;
create trigger attendance_close_trg before update on attendance
  for each row execute function attendance_close();
