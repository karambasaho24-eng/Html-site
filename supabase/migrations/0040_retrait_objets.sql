-- ============================================================================
-- 0040 — Le site revient à l'essentiel : cahiers, notes, documents.
--
-- Les objets (sac, fournitures, papiers remis en main propre, avatars…) sont
-- retirés de l'application. Cette migration ferme leurs portes CÔTÉ BASE, et
-- seulement cela :
--
--   · AUCUNE table n'est supprimée, AUCUNE ligne n'est modifiée ni effacée.
--     Les objets, sacs, papiers et fiches restent en base, inertes. Les purger
--     est un geste irréversible, à faire à part, après sauvegarde : voir
--     docs/NETTOYAGE-BASE.md.
--   · On retire les accès qui n'ont plus de raison d'être, et surtout celui qui
--     serait devenu une FAILLE : l'inspection d'un cahier par l'encadrement
--     reposait sur le « sac » déclaré. Les anciennes lignes de class_bags
--     continueraient d'ouvrir le cahier des élèves pour toujours, sans qu'aucun
--     écran ne permette plus de les retirer. Un cahier n'est lisible que par
--     son propriétaire (et, pour un cahier de classe, par la classe).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lecture d'un cahier : propriétaire, ou classe pour un cahier de classe
-- ---------------------------------------------------------------------------
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

drop policy if exists notebooks_read on notebooks;
create policy notebooks_read on notebooks
  for select to authenticated
  using (owner_id = auth.uid() or (class_id is not null and app_is_member(class_id)));

-- ---------------------------------------------------------------------------
-- 2. Le garde du « lieu » d'un cahier (resté en salle, rangé dans un sac…)
--
-- Il refusait de modifier un cahier « laissé en salle ». Sans objets, plus rien
-- ne le range ni ne l'oublie : on retire le garde pour qu'aucun cahier ne reste
-- jamais bloqué par un lieu que plus aucun écran ne peut corriger.
-- ---------------------------------------------------------------------------
drop trigger if exists notebooks_garde_du_lieu on notebooks;

-- ---------------------------------------------------------------------------
-- 3. Procédures des anciens systèmes : on retire l'accès, on ne supprime rien
--
-- On retrouve les fonctions par leur NOM (et non leur signature) : si l'une
-- n'existe pas dans un projet, la boucle passe simplement à la suivante.
-- ---------------------------------------------------------------------------
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
    execute format('revoke execute on function %s from public, anon, authenticated', r.signature);
  end loop;
end $$;
