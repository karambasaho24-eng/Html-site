-- ============================================================================
-- OJM ACADEMY — Fonctions métier, vues, Realtime, Storage
-- Migration 0003
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Génération d'un code de classe lisible : K7F-29A
-- Alphabet sans caractères ambigus (0/O, 1/I).
-- ---------------------------------------------------------------------------
create or replace function app_generate_class_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..3 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    end loop;
    candidate := candidate || '-';
    for i in 1..3 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from classes where code = candidate);
  end loop;
  return candidate;
end $$;

-- Code attribué automatiquement si absent
create or replace function classes_set_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := app_generate_class_code();
  else
    new.code := upper(btrim(new.code));
  end if;
  return new;
end $$;

drop trigger if exists classes_set_code_trg on classes;
create trigger classes_set_code_trg before insert on classes
  for each row execute function classes_set_code();

-- Le créateur devient automatiquement professeur de sa classe
create or replace function classes_add_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into class_members (class_id, user_id, role, status)
  values (new.id, new.owner_id, 'teacher', 'active')
  on conflict (class_id, user_id) do update set role = 'teacher', status = 'active';
  return new;
end $$;

drop trigger if exists classes_add_owner_trg on classes;
create trigger classes_add_owner_trg after insert on classes
  for each row execute function classes_add_owner();

-- Régénérer le code (staff uniquement)
create or replace function regenerate_class_code(target_class uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare new_code text;
begin
  if not app_is_staff(target_class) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;
  new_code := app_generate_class_code();
  update classes set code = new_code where id = target_class;
  return new_code;
end $$;

-- ---------------------------------------------------------------------------
-- Rejoindre une classe avec un code
-- ---------------------------------------------------------------------------
create or replace function join_class(join_code text)
returns table (class_id uuid, class_name text, member_status text)
language plpgsql volatile security definer set search_path = public as $$
declare
  target classes%rowtype;
  wanted_status member_status;
  existing class_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  select * into target from classes
   where code = upper(btrim(join_code)) and archived = false;

  if not found then
    raise exception 'Code de classe introuvable' using errcode = 'P0002';
  end if;

  select * into existing from class_members
   where class_members.class_id = target.id and user_id = auth.uid();

  if found and existing.status = 'banned' then
    raise exception 'Accès à cette classe révoqué' using errcode = '42501';
  end if;

  if found and existing.status = 'active' then
    return query select target.id, target.name, 'active'::text;
    return;
  end if;

  if target.locked or not target.join_open then
    raise exception 'Les inscriptions sont fermées' using errcode = '42501';
  end if;

  wanted_status := case when target.require_approval then 'pending' else 'active' end;

  insert into class_members (class_id, user_id, role, status)
  values (target.id, auth.uid(), 'student', wanted_status)
  on conflict (class_id, user_id)
    do update set status = wanted_status, role = coalesce(class_members.role, 'student');

  insert into activity_logs (class_id, user_id, action, meta)
  values (target.id, auth.uid(), 'class.join', jsonb_build_object('code', target.code));

  return query select target.id, target.name, wanted_status::text;
end $$;

-- ---------------------------------------------------------------------------
-- Sessions : démarrer, pointer une présence, terminer + archiver
-- ---------------------------------------------------------------------------
create or replace function start_session(target_class uuid, session_title text default null)
returns class_sessions
language plpgsql volatile security definer set search_path = public as $$
declare
  created class_sessions;
  next_number int;
begin
  if not app_is_staff(target_class) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;

  update class_sessions set status = 'ended', ended_at = now()
   where class_id = target_class and status = 'live';

  select coalesce(max(number), 0) + 1 into next_number
    from class_sessions where class_id = target_class;

  insert into class_sessions (class_id, title, number, status, started_at, created_by)
  values (
    target_class,
    coalesce(nullif(btrim(session_title), ''), 'Session ' || lpad(next_number::text, 2, '0')),
    next_number, 'live', now(), auth.uid()
  )
  returning * into created;

  insert into boards (class_id, session_id, title) values (target_class, created.id, 'Tableau');
  insert into board_pages (board_id, position, title)
    select id, 0, 'Tableau 1' from boards where session_id = created.id;

  insert into activity_logs (class_id, session_id, user_id, action)
  values (target_class, created.id, auth.uid(), 'session.start');

  return created;
end $$;

create or replace function check_in(target_session uuid)
returns attendance
language plpgsql volatile security definer set search_path = public as $$
declare
  row_out attendance;
  cls uuid;
begin
  cls := app_session_class(target_session);
  if not app_is_member(cls) then
    raise exception 'Vous n''êtes pas membre de cette classe' using errcode = '42501';
  end if;

  insert into attendance (session_id, user_id, status, arrived_at)
  values (target_session, auth.uid(), 'present', now())
  on conflict (session_id, user_id)
    do update set status = case when attendance.manual then attendance.status else 'present' end,
                  left_at = null
  returning * into row_out;

  insert into activity_logs (class_id, session_id, user_id, action)
  values (cls, target_session, auth.uid(), 'session.check_in');

  return row_out;
end $$;

create or replace function end_session(target_session uuid)
returns class_sessions
language plpgsql volatile security definer set search_path = public as $$
declare
  cls uuid;
  updated class_sessions;
  report jsonb;
begin
  cls := app_session_class(target_session);
  if not app_is_staff(cls) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;

  update attendance set left_at = now()
   where session_id = target_session and left_at is null;

  select jsonb_build_object(
    'participants', (select count(*) from attendance where session_id = target_session),
    'exercises',    (select count(*) from exercises where session_id = target_session),
    'questions',    (select count(*) from session_questions where session_id = target_session),
    'announcements',(select count(*) from announcements where session_id = target_session),
    'board_pages',  (select count(*) from board_pages bp
                       join boards b on b.id = bp.board_id
                      where b.session_id = target_session),
    'closed_at',    now()
  ) into report;

  update class_sessions
     set status = 'ended', ended_at = now(), follow_mode = false, summary = report
   where id = target_session
  returning * into updated;

  update exercises set status = 'closed', closed_at = now()
   where session_id = target_session and status = 'live';

  insert into activity_logs (class_id, session_id, user_id, action, meta)
  values (cls, target_session, auth.uid(), 'session.end', report);

  return updated;
end $$;

-- ---------------------------------------------------------------------------
-- Notifier tous les membres d'une classe
-- ---------------------------------------------------------------------------
create or replace function notify_class(
  target_class uuid,
  notif_kind text,
  notif_title text,
  notif_body text default null,
  notif_link text default null,
  include_self boolean default false
) returns int
language plpgsql volatile security definer set search_path = public as $$
declare inserted int;
begin
  if not app_is_staff(target_class) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;

  insert into notifications (user_id, class_id, kind, title, body, link)
  select m.user_id, target_class, notif_kind, notif_title, notif_body, notif_link
    from class_members m
   where m.class_id = target_class
     and m.status = 'active'
     and (include_self or m.user_id <> auth.uid());

  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- ---------------------------------------------------------------------------
-- Capturer le tableau dans le cahier commun
-- ---------------------------------------------------------------------------
create or replace function capture_board_page(
  target_board_page uuid,
  target_notebook uuid,
  page_title text default null,
  snapshot jsonb default null
) returns notebook_pages
language plpgsql volatile security definer set search_path = public as $$
declare
  created notebook_pages;
  next_pos int;
begin
  if not app_can_write_notebook(target_notebook) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;

  select coalesce(max(position), -1) + 1 into next_pos
    from notebook_pages where notebook_id = target_notebook;

  insert into notebook_pages (notebook_id, position, title, body, drawing, origin, origin_ref, created_by)
  values (
    target_notebook, next_pos,
    coalesce(page_title, 'Tableau du professeur'),
    '', coalesce(snapshot, '{}'::jsonb), 'board', target_board_page, auth.uid()
  )
  returning * into created;

  return created;
end $$;

-- ---------------------------------------------------------------------------
-- Correction automatique d'une tentative (QCM, vrai/faux, texte à trous…)
-- ---------------------------------------------------------------------------
create or replace function autograde_attempt(target_attempt uuid)
returns exercise_attempts
language plpgsql volatile security definer set search_path = public as $$
declare
  att exercise_attempts;
  q   record;
  ans exercise_answers;
  total numeric := 0;
  max_total numeric := 0;
  ok boolean;
begin
  select * into att from exercise_attempts where id = target_attempt;
  if not found then
    raise exception 'Tentative introuvable' using errcode = 'P0002';
  end if;
  if not app_is_staff(app_exercise_class(att.exercise_id)) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;

  for q in select * from exercise_questions where exercise_id = att.exercise_id loop
    max_total := max_total + q.points;
    select * into ans from exercise_answers
     where attempt_id = target_attempt and question_id = q.id;

    if not found or q.solution is null then
      continue;
    end if;

    ok := case
      when q.kind in ('qcm', 'single', 'truefalse', 'ordering', 'matching', 'multiple', 'fill')
        then ans.response = q.solution
      else null
    end;

    if ok is not null then
      update exercise_answers
         set correct = ok,
             score = case when ok then q.points else 0 end
       where id = ans.id;
      if ok then total := total + q.points; end if;
    elsif ans.score is not null then
      total := total + ans.score;
    end if;
  end loop;

  update exercise_attempts
     set score = total, max_score = max_total, status = 'graded',
         graded_by = auth.uid(), graded_at = now()
   where id = target_attempt
  returning * into att;

  return att;
end $$;

-- ---------------------------------------------------------------------------
-- Vues
-- ---------------------------------------------------------------------------
-- Questions sans la solution : ce que l'élève a le droit de lire.
create or replace view exercise_questions_public
with (security_invoker = true) as
  select id, exercise_id, position, kind, prompt, helper, options, points
    from exercise_questions;

-- Résultats de sondage agrégés
create or replace view poll_results
with (security_invoker = true) as
  select p.id as poll_id, p.session_id, v.choice, count(*)::int as votes
    from polls p
    left join poll_votes v on v.poll_id = p.id
   group by p.id, p.session_id, v.choice;

-- Progression d'un élève par classe
create or replace view student_progress
with (security_invoker = true) as
  select g.class_id,
         g.user_id,
         count(*)::int                                   as graded_count,
         round(avg(g.score / nullif(g.max_score, 0) * 20), 2) as average_on_20,
         max(g.created_at)                               as last_graded_at
    from grades g
   group by g.class_id, g.user_id;

-- ---------------------------------------------------------------------------
-- Realtime : uniquement les tables qui ont besoin d'être diffusées.
-- Les abonnements sont filtrés côté client par class_id / session_id.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'class_sessions','attendance','board_pages','board_elements','boards',
    'notebook_pages','notebooks','announcements','session_questions','hands',
    'polls','poll_votes','timers','exercises','exercise_attempts',
    'notifications','class_members','documents','activity_logs'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
             when undefined_object  then null;
    end;
  end loop;
end $$;

-- Identité complète pour recevoir les anciennes valeurs sur UPDATE/DELETE
alter table board_elements   replica identity full;
alter table notebook_pages   replica identity full;
alter table class_sessions   replica identity full;
alter table attendance       replica identity full;
alter table hands            replica identity full;
alter table timers           replica identity full;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname like 'ojm_%'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- Convention de chemin : documents/<class_id>/<uuid>-<nom>
create policy ojm_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      owner = auth.uid()
      or app_is_member(nullif(split_part(name, '/', 1), '')::uuid)
    )
  );

create policy ojm_documents_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and owner = auth.uid()
    and app_can_write_class(nullif(split_part(name, '/', 1), '')::uuid)
  );

create policy ojm_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (owner = auth.uid() or app_is_staff(nullif(split_part(name, '/', 1), '')::uuid))
  );

create policy ojm_avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

create policy ojm_avatars_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

create policy ojm_avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

create policy ojm_avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
