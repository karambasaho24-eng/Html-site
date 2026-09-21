-- ============================================================================
-- OJM ACADEMY — Sécurité
-- Migration 0002 : fonctions d'aide (SECURITY DEFINER) + RLS sur chaque table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fonctions d'aide. SECURITY DEFINER pour éviter la récursion des politiques
-- (une politique de class_members ne doit pas relire class_members via RLS).
-- ---------------------------------------------------------------------------
create or replace function app_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role_key in ('super_admin', 'admin', 'director')
  );
$$;

create or replace function app_has_permission(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles p
    join role_permissions rp on rp.role_key = p.role_key
    where p.id = auth.uid() and rp.permission_key = perm
  );
$$;

create or replace function app_is_member(target_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_is_admin() or exists (
    select 1 from class_members
    where class_id = target_class
      and user_id  = auth.uid()
      and status   = 'active'
  );
$$;

create or replace function app_is_staff(target_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_is_admin()
    or exists (select 1 from classes where id = target_class and owner_id = auth.uid())
    or exists (
      select 1 from class_members
      where class_id = target_class
        and user_id  = auth.uid()
        and status   = 'active'
        and role in ('teacher', 'assistant')
    );
$$;

create or replace function app_can_write_class(target_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- staff, ou membre non muet et non observateur
  select app_is_staff(target_class) or exists (
    select 1 from class_members
    where class_id = target_class
      and user_id  = auth.uid()
      and status   = 'active'
      and muted    = false
      and role <> 'observer'
  );
$$;

create or replace function app_session_class(target_session uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from class_sessions where id = target_session;
$$;

create or replace function app_board_class(target_board uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from boards where id = target_board;
$$;

create or replace function app_board_page_board(target_page uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select board_id from board_pages where id = target_page;
$$;

create or replace function app_exercise_class(target_exercise uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from exercises where id = target_exercise;
$$;

-- Peut-on lire ce cahier ? personnel => propriétaire ; partagé => membre de la classe
create or replace function app_can_read_notebook(target_notebook uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from notebooks n
    where n.id = target_notebook
      and (
        n.owner_id = auth.uid()
        or (n.class_id is not null and app_is_member(n.class_id))
      )
  );
$$;

-- Peut-on écrire dans ce cahier ?
create or replace function app_can_write_notebook(target_notebook uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from notebooks n
    where n.id = target_notebook
      and (
        n.owner_id = auth.uid()
        or (n.class_id is not null and app_is_staff(n.class_id))
        or (n.class_id is not null and n.collaborative and app_can_write_class(n.class_id))
      )
  );
$$;

-- Écriture sur le tableau : le staff toujours, les élèves selon le mode.
create or replace function app_can_draw_board(target_board uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from boards b
    where b.id = target_board
      and (
        app_is_staff(b.class_id)
        or (b.mode = 'open'          and app_can_write_class(b.class_id))
        or (b.mode = 'participative' and app_can_write_class(b.class_id)
            and b.allowed ? auth.uid()::text)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Activation de RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','classes','class_members','class_sessions','attendance',
    'notebooks','notebook_pages','boards','board_pages','board_elements',
    'folders','documents','courses','course_items',
    'exercises','exercise_questions','exercise_attempts','exercise_answers','grades',
    'announcements','session_questions','hands','polls','poll_votes','timers',
    'notifications','favorites','activity_logs',
    'roles','permissions','role_permissions'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Nettoyage idempotent des politiques existantes
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Référentiel RBAC : lecture pour tous les connectés, écriture admin
-- ---------------------------------------------------------------------------
create policy roles_read   on roles   for select to authenticated using (true);
create policy perms_read   on permissions for select to authenticated using (true);
create policy rp_read      on role_permissions for select to authenticated using (true);
create policy roles_admin  on roles   for all to authenticated using (app_is_admin()) with check (app_is_admin());
create policy perms_admin  on permissions for all to authenticated using (app_is_admin()) with check (app_is_admin());
create policy rp_admin     on role_permissions for all to authenticated using (app_is_admin()) with check (app_is_admin());

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------
create policy profiles_read on profiles
  for select to authenticated using (true);

create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid() or app_is_admin())
  with check (id = auth.uid() or app_is_admin());

create policy profiles_self_insert on profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_admin_delete on profiles
  for delete to authenticated using (app_is_admin());

-- ---------------------------------------------------------------------------
-- Classes
-- ---------------------------------------------------------------------------
create policy classes_read on classes
  for select to authenticated
  using (owner_id = auth.uid() or app_is_member(id));

create policy classes_insert on classes
  for insert to authenticated
  with check (owner_id = auth.uid() and (app_has_permission('CREATE_CLASS') or app_is_admin()));

create policy classes_update on classes
  for update to authenticated
  using (app_is_staff(id)) with check (app_is_staff(id));

create policy classes_delete on classes
  for delete to authenticated
  using (owner_id = auth.uid() or app_is_admin());

-- ---------------------------------------------------------------------------
-- Membres
-- ---------------------------------------------------------------------------
create policy members_read on class_members
  for select to authenticated
  using (user_id = auth.uid() or app_is_member(class_id) or app_is_staff(class_id));

-- L'élève s'inscrit lui-même (le code de classe est vérifié par la RPC join_class)
create policy members_self_join on class_members
  for insert to authenticated
  with check (user_id = auth.uid() and role = 'student');

create policy members_staff_write on class_members
  for insert to authenticated with check (app_is_staff(class_id));

create policy members_staff_update on class_members
  for update to authenticated
  using (app_is_staff(class_id)) with check (app_is_staff(class_id));

create policy members_leave on class_members
  for delete to authenticated
  using (user_id = auth.uid() or app_is_staff(class_id));

-- ---------------------------------------------------------------------------
-- Sessions & présence
-- ---------------------------------------------------------------------------
create policy sessions_read on class_sessions
  for select to authenticated using (app_is_member(class_id));

create policy sessions_write on class_sessions
  for all to authenticated
  using (app_is_staff(class_id)) with check (app_is_staff(class_id));

create policy attendance_read on attendance
  for select to authenticated
  using (user_id = auth.uid() or app_is_staff(app_session_class(session_id)));

create policy attendance_self on attendance
  for insert to authenticated
  with check (user_id = auth.uid() and app_is_member(app_session_class(session_id)));

create policy attendance_self_update on attendance
  for update to authenticated
  using (user_id = auth.uid() or app_is_staff(app_session_class(session_id)))
  with check (user_id = auth.uid() or app_is_staff(app_session_class(session_id)));

create policy attendance_staff_delete on attendance
  for delete to authenticated using (app_is_staff(app_session_class(session_id)));

-- ---------------------------------------------------------------------------
-- Cahiers
-- ---------------------------------------------------------------------------
create policy notebooks_read on notebooks
  for select to authenticated
  using (owner_id = auth.uid() or (class_id is not null and app_is_member(class_id)));

create policy notebooks_insert on notebooks
  for insert to authenticated
  with check (
    (kind = 'personal' and owner_id = auth.uid())
    or (class_id is not null and app_is_staff(class_id))
  );

create policy notebooks_update on notebooks
  for update to authenticated
  using (owner_id = auth.uid() or (class_id is not null and app_is_staff(class_id)))
  with check (owner_id = auth.uid() or (class_id is not null and app_is_staff(class_id)));

create policy notebooks_delete on notebooks
  for delete to authenticated
  using (owner_id = auth.uid() or (class_id is not null and app_is_staff(class_id)));

create policy pages_read on notebook_pages
  for select to authenticated using (app_can_read_notebook(notebook_id));

create policy pages_write on notebook_pages
  for insert to authenticated with check (app_can_write_notebook(notebook_id));

create policy pages_update on notebook_pages
  for update to authenticated
  using (app_can_write_notebook(notebook_id)) with check (app_can_write_notebook(notebook_id));

create policy pages_delete on notebook_pages
  for delete to authenticated using (app_can_write_notebook(notebook_id));

-- ---------------------------------------------------------------------------
-- Tableau
-- ---------------------------------------------------------------------------
create policy boards_read on boards
  for select to authenticated using (app_is_member(class_id));

create policy boards_write on boards
  for all to authenticated
  using (app_is_staff(class_id)) with check (app_is_staff(class_id));

create policy board_pages_read on board_pages
  for select to authenticated using (app_is_member(app_board_class(board_id)));

create policy board_pages_write on board_pages
  for all to authenticated
  using (app_is_staff(app_board_class(board_id)))
  with check (app_is_staff(app_board_class(board_id)));

create policy board_elements_read on board_elements
  for select to authenticated
  using (app_is_member(app_board_class(app_board_page_board(page_id))));

create policy board_elements_insert on board_elements
  for insert to authenticated
  with check (author_id = auth.uid() and app_can_draw_board(app_board_page_board(page_id)));

create policy board_elements_update on board_elements
  for update to authenticated
  using (
    author_id = auth.uid()
    or app_is_staff(app_board_class(app_board_page_board(page_id)))
  )
  with check (
    author_id = auth.uid()
    or app_is_staff(app_board_class(app_board_page_board(page_id)))
  );

create policy board_elements_delete on board_elements
  for delete to authenticated
  using (
    author_id = auth.uid()
    or app_is_staff(app_board_class(app_board_page_board(page_id)))
  );

-- ---------------------------------------------------------------------------
-- Documents & dossiers
-- ---------------------------------------------------------------------------
create policy folders_read on folders
  for select to authenticated
  using (owner_id = auth.uid() or (class_id is not null and app_is_member(class_id)));

create policy folders_write on folders
  for all to authenticated
  using (owner_id = auth.uid() or (class_id is not null and app_is_staff(class_id)))
  with check (owner_id = auth.uid() or (class_id is not null and app_is_staff(class_id)));

create policy documents_read on documents
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (class_id is not null and shared and app_is_member(class_id))
    or (class_id is not null and app_is_staff(class_id))
  );

create policy documents_insert on documents
  for insert to authenticated
  with check (owner_id = auth.uid() and (class_id is null or app_can_write_class(class_id)));

create policy documents_update on documents
  for update to authenticated
  using (owner_id = auth.uid() or (class_id is not null and app_is_staff(class_id)))
  with check (owner_id = auth.uid() or (class_id is not null and app_is_staff(class_id)));

create policy documents_delete on documents
  for delete to authenticated
  using (owner_id = auth.uid() or (class_id is not null and app_is_staff(class_id)));

-- ---------------------------------------------------------------------------
-- Cours préparés
-- ---------------------------------------------------------------------------
create policy courses_read on courses
  for select to authenticated
  using (owner_id = auth.uid() or (class_id is not null and app_is_member(class_id)));

create policy courses_write on courses
  for all to authenticated
  using (owner_id = auth.uid() or (class_id is not null and app_is_staff(class_id)))
  with check (owner_id = auth.uid() or (class_id is not null and app_is_staff(class_id)));

create policy course_items_read on course_items
  for select to authenticated
  using (exists (
    select 1 from courses c where c.id = course_id
      and (c.owner_id = auth.uid() or (c.class_id is not null and app_is_member(c.class_id)))
  ));

create policy course_items_write on course_items
  for all to authenticated
  using (exists (
    select 1 from courses c where c.id = course_id
      and (c.owner_id = auth.uid() or (c.class_id is not null and app_is_staff(c.class_id)))
  ))
  with check (exists (
    select 1 from courses c where c.id = course_id
      and (c.owner_id = auth.uid() or (c.class_id is not null and app_is_staff(c.class_id)))
  ));

-- ---------------------------------------------------------------------------
-- Exercices
-- ---------------------------------------------------------------------------
create policy exercises_read on exercises
  for select to authenticated
  using (app_is_staff(class_id) or (app_is_member(class_id) and status <> 'draft'));

create policy exercises_write on exercises
  for all to authenticated
  using (app_is_staff(class_id)) with check (app_is_staff(class_id));

-- Les élèves lisent les questions, jamais la colonne solution : la vue
-- exercise_questions_public (migration 0003) est utilisée côté élève.
create policy questions_read on exercise_questions
  for select to authenticated
  using (
    app_is_staff(app_exercise_class(exercise_id))
    or exists (
      select 1 from exercises e
      where e.id = exercise_id and e.status in ('live','closed','graded')
        and app_is_member(e.class_id)
    )
  );

create policy questions_write on exercise_questions
  for all to authenticated
  using (app_is_staff(app_exercise_class(exercise_id)))
  with check (app_is_staff(app_exercise_class(exercise_id)));

create policy attempts_read on exercise_attempts
  for select to authenticated
  using (user_id = auth.uid() or app_is_staff(app_exercise_class(exercise_id)));

create policy attempts_insert on exercise_attempts
  for insert to authenticated
  with check (user_id = auth.uid() and app_is_member(app_exercise_class(exercise_id)));

create policy attempts_update on exercise_attempts
  for update to authenticated
  using (
    (user_id = auth.uid() and status = 'started')
    or app_is_staff(app_exercise_class(exercise_id))
  )
  with check (
    (user_id = auth.uid() and status in ('started','submitted'))
    or app_is_staff(app_exercise_class(exercise_id))
  );

create policy attempts_delete on exercise_attempts
  for delete to authenticated using (app_is_staff(app_exercise_class(exercise_id)));

create policy answers_read on exercise_answers
  for select to authenticated
  using (exists (
    select 1 from exercise_attempts a where a.id = attempt_id
      and (a.user_id = auth.uid() or app_is_staff(app_exercise_class(a.exercise_id)))
  ));

create policy answers_write on exercise_answers
  for insert to authenticated
  with check (exists (
    select 1 from exercise_attempts a where a.id = attempt_id
      and a.user_id = auth.uid() and a.status = 'started'
  ));

create policy answers_update on exercise_answers
  for update to authenticated
  using (exists (
    select 1 from exercise_attempts a where a.id = attempt_id
      and ((a.user_id = auth.uid() and a.status = 'started')
           or app_is_staff(app_exercise_class(a.exercise_id)))
  ))
  with check (exists (
    select 1 from exercise_attempts a where a.id = attempt_id
      and ((a.user_id = auth.uid() and a.status = 'started')
           or app_is_staff(app_exercise_class(a.exercise_id)))
  ));

create policy grades_read on grades
  for select to authenticated
  using (user_id = auth.uid() or app_is_staff(class_id));

create policy grades_write on grades
  for all to authenticated
  using (app_is_staff(class_id)) with check (app_is_staff(class_id));

-- ---------------------------------------------------------------------------
-- Vie de la session
-- ---------------------------------------------------------------------------
create policy announcements_read on announcements
  for select to authenticated using (app_is_member(class_id));

create policy announcements_write on announcements
  for all to authenticated
  using (app_is_staff(class_id)) with check (app_is_staff(class_id));

create policy sq_read on session_questions
  for select to authenticated
  using (user_id = auth.uid() or app_is_staff(app_session_class(session_id)));

create policy sq_insert on session_questions
  for insert to authenticated
  with check (user_id = auth.uid() and app_can_write_class(app_session_class(session_id)));

create policy sq_update on session_questions
  for update to authenticated
  using (app_is_staff(app_session_class(session_id)) or user_id = auth.uid())
  with check (app_is_staff(app_session_class(session_id)) or user_id = auth.uid());

create policy sq_delete on session_questions
  for delete to authenticated
  using (app_is_staff(app_session_class(session_id)) or user_id = auth.uid());

create policy hands_read on hands
  for select to authenticated using (app_is_member(app_session_class(session_id)));

create policy hands_self on hands
  for insert to authenticated
  with check (user_id = auth.uid() and app_can_write_class(app_session_class(session_id)));

create policy hands_update on hands
  for update to authenticated
  using (user_id = auth.uid() or app_is_staff(app_session_class(session_id)))
  with check (user_id = auth.uid() or app_is_staff(app_session_class(session_id)));

create policy hands_delete on hands
  for delete to authenticated
  using (user_id = auth.uid() or app_is_staff(app_session_class(session_id)));

create policy polls_read on polls
  for select to authenticated using (app_is_member(app_session_class(session_id)));

create policy polls_write on polls
  for all to authenticated
  using (app_is_staff(app_session_class(session_id)))
  with check (app_is_staff(app_session_class(session_id)));

create policy votes_read on poll_votes
  for select to authenticated
  using (exists (select 1 from polls p where p.id = poll_id and app_is_member(app_session_class(p.session_id))));

create policy votes_self on poll_votes
  for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from polls p where p.id = poll_id and p.status = 'open'
                  and app_can_write_class(app_session_class(p.session_id))));

create policy votes_update on poll_votes
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy timers_read on timers
  for select to authenticated using (app_is_member(app_session_class(session_id)));

create policy timers_write on timers
  for all to authenticated
  using (app_is_staff(app_session_class(session_id)))
  with check (app_is_staff(app_session_class(session_id)));

-- ---------------------------------------------------------------------------
-- Transversal
-- ---------------------------------------------------------------------------
create policy notifications_read on notifications
  for select to authenticated using (user_id = auth.uid());

create policy notifications_update on notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_delete on notifications
  for delete to authenticated using (user_id = auth.uid());

-- L'insertion passe par la RPC notify_class (SECURITY DEFINER) ; le staff peut
-- aussi notifier directement les membres de ses classes.
create policy notifications_insert on notifications
  for insert to authenticated
  with check (user_id = auth.uid() or (class_id is not null and app_is_staff(class_id)));

create policy favorites_all on favorites
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy logs_read on activity_logs
  for select to authenticated
  using (
    user_id = auth.uid()
    or (class_id is not null and app_is_staff(class_id))
  );

create policy logs_insert on activity_logs
  for insert to authenticated
  with check (user_id = auth.uid() and (class_id is null or app_is_member(class_id)));
