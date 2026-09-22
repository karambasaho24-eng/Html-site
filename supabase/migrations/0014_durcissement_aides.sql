-- ============================================================================
-- CLASSE PARALLÈLE — Durcissement des aides ajoutées en 0012
-- Migration 0014
--
-- Les deux aides ajoutées par la migration 0012 ont hérité du droit
-- d'exécution par défaut, comme l'avait signalé le linter pour les premières
-- avant la migration 0005. Elles ne sont évaluées que dans des politiques
-- « to authenticated » : personne de non connecté n'a à les appeler.
-- ============================================================================

revoke all on function app_is_moderator() from public, anon;
grant execute on function app_is_moderator() to authenticated;

revoke all on function app_is_staff_of(uuid, uuid) from public, anon;
grant execute on function app_is_staff_of(uuid, uuid) to authenticated;
