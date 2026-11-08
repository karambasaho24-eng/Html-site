-- ============================================================================
-- 0046 — Retour des objets (sac, cahier oublié, remises, confiscation…)
--
-- Annule les portes fermées par 0040, et seulement elles. Aucune table, aucune
-- ligne n'est touchée. Les fonctions existent déjà en base : on rend l'accès.
--
-- On NE rétablit PAS l'ancienne lecture des cahiers par class_bags (la faille
-- relevée en 0040) : l'inspection passe par inspect_notebook, qui vérifie
-- elle-même que l'encadrement a le droit de regarder.
-- ============================================================================

-- 1. Le garde du lieu d'un cahier (laissé en salle, rangé dans un sac…)
drop trigger if exists notebooks_garde_du_lieu on notebooks;
create trigger notebooks_garde_du_lieu
  before insert or update of place, container_id, size, place_session, place_class on notebooks
  for each row execute function app_garde_du_lieu();

-- 2. Les procédures des objets : de nouveau appelables par un compte connecté
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'inspect_notebook', 'accept_notebook_handoff',
         'accept_belonging_handoff', 'confiscate_belonging', 'release_belonging',
         'return_belonging_handoff', 'forgotten_in_class', 'recover_belonging',
         'recover_notebook', 'restitute_forgotten', 'reprendre_a_ma_place',
         'bannir_personnage', 'class_standings'
       ])
  loop
    execute format('grant execute on function %s to authenticated', r.signature);
  end loop;
end $$;
