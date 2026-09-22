-- ============================================================================
-- CLASSE PARALLÈLE — Le tableau libre
-- Migration 0013
--
-- « Sur son tableau, il est libre. » Une page de tableau peut désormais
-- porter une image de fond : une photo, un plan, une page de PDF. On écrit
-- par-dessus, et l'effacement du tracé ne la touche pas — c'est un calque,
-- pas un élément dessiné.
-- ============================================================================

alter table board_pages add column if not exists background_image text;
