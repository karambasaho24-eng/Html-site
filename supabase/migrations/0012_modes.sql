-- ============================================================================
-- CLASSE PARALLÈLE — Modes de séance, renvoi, modération
-- Migration 0012
--
-- Une séance n'est pas toujours un cours. On se réunit aussi pour délibérer,
-- et on se retrouve parfois seulement pour distribuer des ordres. Les trois
-- ne se jouent pas de la même façon : au cours on écoute, en réunion on prend
-- la parole à tour de rôle, à la distribution on ne fait que tendre du papier.
-- Le mode change donc les outils offerts et le vocabulaire employé.
--
-- Cette migration ajoute aussi le renvoi — un instructeur peut faire sortir
-- quelqu'un de sa salle — et le rôle de modérateur, qui veille sur les
-- papiers qui circulent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Le mode de séance
-- ---------------------------------------------------------------------------
do $$ begin
  create type session_mode as enum ('cours', 'reunion', 'distribution');
exception when duplicate_object then null; end $$;

alter table class_sessions add column if not exists mode session_mode not null default 'cours';

-- En réunion, on tient un tour de parole : la file est ordonnée et publique,
-- alors qu'une main levée en cours reste une demande adressée au professeur.
alter table class_sessions add column if not exists speaking_order jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Le renvoi
--
-- « Vous ne faites pas partie de ce cours. » L'instructeur en juge seul, mais
-- le renvoi est écrit : il a une raison, une heure, un auteur. Renvoyer n'est
-- pas exclure de la classe — on est prié de sortir de la séance en cours.
-- ---------------------------------------------------------------------------
create table if not exists session_ejections (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references class_sessions(id) on delete cascade,
  class_id    uuid not null references classes(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  by_user     uuid references profiles(id) on delete set null,
  reason      text,
  attested    boolean not null default false,  -- signifié de vive voix
  created_at  timestamptz not null default now(),
  unique (session_id, user_id)
);
create index if not exists ejections_session_idx on session_ejections(session_id);

alter table session_ejections enable row level security;

drop policy if exists ejections_read on session_ejections;
create policy ejections_read on session_ejections
  for select to authenticated
  using (user_id = auth.uid() or app_is_staff(class_id));

-- Seul l'encadrement renvoie, et personne ne supprime un renvoi déjà porté
-- au registre : on le lève, ce qui est une suppression volontaire et tracée.
drop policy if exists ejections_staff on session_ejections;
create policy ejections_staff on session_ejections
  for all to authenticated
  using (app_is_staff(class_id)) with check (app_is_staff(class_id));

-- app_is_staff ne répond que pour l'appelant ; il faut aussi pouvoir poser la
-- question au sujet de quelqu'un d'autre.
create or replace function app_is_staff_of(target_class uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from classes c where c.id = target_class and c.owner_id = target_user
  ) or exists (
    select 1 from class_members m
    where m.class_id = target_class and m.user_id = target_user
      and m.status = 'active' and m.role in ('teacher', 'assistant')
  );
$$;

-- Renvoyer quelqu'un : ferme sa présence, l'inscrit au registre, le prévient.
create or replace function eject_member(
  target_session uuid, target_user uuid, motif text default null, proche boolean default false
) returns session_ejections
language plpgsql volatile security definer set search_path = public as $$
declare
  seance class_sessions;
  ligne  session_ejections;
begin
  select * into seance from class_sessions where id = target_session;
  if seance.id is null then
    raise exception 'Séance introuvable' using errcode = 'P0002';
  end if;
  if not app_is_staff(seance.class_id) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;
  if target_user = auth.uid() then
    raise exception 'On ne se renvoie pas soi-même' using errcode = '22023';
  end if;
  if app_is_staff_of(seance.class_id, target_user) then
    raise exception 'L''encadrement ne se renvoie pas entre soi' using errcode = '42501';
  end if;

  insert into session_ejections (session_id, class_id, user_id, by_user, reason, attested)
  values (target_session, seance.class_id, target_user, auth.uid(), motif, proche)
  on conflict (session_id, user_id) do update
    set reason = excluded.reason, attested = excluded.attested,
        by_user = excluded.by_user, created_at = now()
  returning * into ligne;

  update attendance
     set left_at = now(), status = 'offline'
   where session_id = target_session and user_id = target_user and left_at is null;

  insert into activity_logs (class_id, user_id, action, meta)
  values (seance.class_id, auth.uid(), 'seance.renvoi',
          jsonb_build_object('seance', target_session, 'membre', target_user, 'motif', motif));

  insert into notifications (user_id, class_id, kind, title, body, link)
  values (target_user, seance.class_id, 'renvoi',
          'Vous avez été prié de quitter la séance',
          coalesce(nullif(motif, ''), 'Aucun motif n''a été porté.'),
          '/classe/' || seance.class_id::text);

  return ligne;
end $$;

revoke all on function eject_member(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function eject_member(uuid, uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ce qu'on a apporté devient lisible — mais rien de plus
--
-- La migration 0011 a ouvert la table notebooks à l'encadrement pour les
-- supports figurant au cartable. Les pages, elles, passent par
-- app_can_read_notebook, qui ignorait encore le cartable : on pouvait voir le
-- dos du cahier sans pouvoir l'ouvrir. On complète donc le même chemin, une
-- seule fois, pour les pages comme pour les pense-bêtes.
-- ---------------------------------------------------------------------------
create or replace function app_can_read_notebook(target_notebook uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from notebooks n
    where n.id = target_notebook
      and (
        n.owner_id = auth.uid()
        or (n.class_id is not null and app_is_member(n.class_id))
        or exists (
          select 1 from class_bags b
          where b.user_id = n.owner_id
            and b.notebooks ? n.id::text
            and app_is_staff(b.class_id)
        )
      )
  );
$$;

-- L'inspection est une lecture, jamais une écriture : app_can_write_notebook
-- reste volontairement inchangé. On regarde le cahier d'un cadet, on n'écrit
-- pas dedans à sa place.

-- ---------------------------------------------------------------------------
-- 4. Les modérateurs
--
-- L'administration principale reste à une personne. Les modérateurs ne
-- l'assistent que sur ce qui circule : les papiers remis, les signalements,
-- les journaux. Ils n'ouvrent pas les cahiers et ne touchent pas aux comptes.
-- ---------------------------------------------------------------------------
insert into roles (key, label, rank, description) values
  ('moderator', 'Modérateur', 70, 'Veille sur les papiers qui circulent et sur les signalements')
on conflict (key) do update
  set label = excluded.label, rank = excluded.rank, description = excluded.description;

insert into permissions (key, label, category) values
  ('MANAGE_PAPERS', 'Contrôler les papiers remis', 'administration')
on conflict (key) do update set label = excluded.label, category = excluded.category;

insert into role_permissions (role_key, permission_key)
select 'moderator', p from unnest(array[
  'MODERATE', 'MANAGE_PAPERS', 'VIEW_LOGS', 'VIEW_ARCHIVES',
  'VIEW_STUDENTS', 'VIEW_DOCUMENT', 'VIEW_BOARD',
  'USE_NOTEBOOK', 'READ_SHARED_NOTEBOOK', 'ASK_QUESTION', 'RAISE_HAND',
  'CREATE_CLASS', 'MANAGE_CLASS', 'MANAGE_MEMBERS', 'RUN_SESSION'
]) p
on conflict (role_key, permission_key) do nothing;

-- Les administrateurs héritent de la nouvelle permission comme des autres.
insert into role_permissions (role_key, permission_key)
select r.key, 'MANAGE_PAPERS' from roles r where r.key in ('super_admin', 'admin', 'director')
on conflict (role_key, permission_key) do nothing;

-- Un modérateur voit passer les remises, sans pouvoir les trancher : décider
-- à la place du destinataire viderait le geste de son sens.
create or replace function app_is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role_key in ('moderator', 'admin', 'super_admin')
  );
$$;

drop policy if exists handoffs_read on paper_handoffs;
create policy handoffs_read on paper_handoffs
  for select to authenticated
  using (
    from_user = auth.uid() or to_user = auth.uid()
    or (class_id is not null and app_is_staff(class_id))
    or app_is_moderator()
  );

drop policy if exists papers_read on papers;
create policy papers_read on papers
  for select to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from paper_handoffs h
      where h.paper_id = papers.id and h.to_user = auth.uid()
    )
    or (class_id is not null and app_is_staff(class_id))
    or app_is_moderator()
  );

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table session_ejections';
  exception when duplicate_object then null;
           when undefined_object  then null;
  end;
end $$;
