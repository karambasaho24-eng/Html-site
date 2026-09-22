-- ============================================================================
-- OJM ACADEMY — Durcissement
-- Migration 0005 : search_path figé, surface RPC réduite.
--
-- Deux corrections signalées par le linter de sécurité Supabase :
--   · les déclencheurs sans search_path explicite sont détournables
--   · toutes les fonctions du schéma public sont exposées par PostgREST ;
--     les aides internes n'ont rien à faire dans l'API publique.
-- ============================================================================

-- --- 1. search_path figé sur les déclencheurs ------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function attendance_close() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.left_at is not null and (old.left_at is null or old.left_at <> new.left_at) then
    new.seconds := greatest(0, extract(epoch from (new.left_at - new.arrived_at))::int);
  end if;
  return new;
end $$;

-- --- 2. Surface RPC ---------------------------------------------------------
-- On retire d'abord l'accès par défaut sur toutes les fonctions du schéma,
-- puis on ne rouvre que ce qui doit l'être.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
  end loop;
end $$;

-- Aides appelées depuis les politiques RLS : elles sont évaluées avec le rôle
-- de l'appelant, qui doit donc pouvoir les exécuter. Elles ne renvoient que des
-- booléens ou un identifiant de rattachement, jamais de données de classe.
grant execute on function
  app_is_admin(),
  app_has_permission(text),
  app_is_member(uuid),
  app_is_staff(uuid),
  app_can_write_class(uuid),
  app_session_class(uuid),
  app_board_class(uuid),
  app_board_page_board(uuid),
  app_exercise_class(uuid),
  app_can_read_notebook(uuid),
  app_can_write_notebook(uuid),
  app_can_draw_board(uuid)
to authenticated;

-- Procédures métier : appelées par l'application, elles vérifient elles-mêmes
-- les droits avant d'agir.
grant execute on function
  join_class(text),
  start_session(uuid, text),
  check_in(uuid),
  end_session(uuid),
  notify_class(uuid, text, text, text, text, boolean),
  capture_board_page(uuid, uuid, text, jsonb),
  autograde_attempt(uuid),
  regenerate_class_code(uuid)
to authenticated;

-- Tout le reste — générateur de code, fonctions de déclencheur — reste
-- inaccessible depuis l'API : les déclencheurs les invoquent côté serveur,
-- et les fonctions SECURITY DEFINER qui en ont besoin s'exécutent avec les
-- droits du propriétaire.
