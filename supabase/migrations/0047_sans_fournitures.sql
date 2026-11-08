-- ============================================================================
-- 0047 — Pas de fournitures (la remise de cahier, elle, reste : voir 0048).
--
-- Il n'y a plus de système de fournitures (sac, trousse, objets à sortir) :
-- chacun écrit directement, seule l'encre est limitée. On referme donc ce que
-- 0046 avait rouvert, exactement comme 0040 : aucune table supprimée, aucune
-- ligne touchée.
-- ============================================================================

-- Le garde du « lieu » d'un cahier (resté en salle, rangé dans un sac…)
drop trigger if exists notebooks_garde_du_lieu on notebooks;

-- Les procédures des objets : plus appelables depuis le site
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'inspect_notebook',
         'accept_belonging_handoff', 'confiscate_belonging', 'release_belonging',
         'return_belonging_handoff', 'forgotten_in_class', 'recover_belonging',
         'recover_notebook', 'restitute_forgotten', 'reprendre_a_ma_place',
         'bannir_personnage', 'class_standings'
       ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.signature);
  end loop;
end $$;
