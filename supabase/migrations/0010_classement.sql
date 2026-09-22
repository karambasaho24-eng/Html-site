-- ============================================================================
-- CLASSE PARALLÈLE — Classement lisible de tous
-- Migration 0010
--
-- La vue class_standings s'exécutait avec les droits de l'appelant. Elle lit
-- service_records, dont la RLS ne montre à un membre que ses propres
-- inscriptions : chacun ne voyait donc qu'une seule ligne — la sienne. Un
-- classement où l'on ne voit que soi n'est pas un classement.
--
-- Or un classement de promotion est un tableau d'honneur : il est affiché, et
-- c'est précisément ce qui lui donne son poids. On expose donc l'agrégat à
-- tous les membres de l'espace, sans ouvrir pour autant le détail des livrets
-- — les notes axe par axe, les blâmes et les motifs restent privés.
-- ============================================================================

drop view if exists class_standings;

create or replace function class_standings(target_class uuid)
returns table (
  user_id     uuid,
  evaluations int,
  taux        numeric,
  total       numeric,
  derniere    timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.user_id,
         count(*)::int                                          as evaluations,
         round(avg(r.score / nullif(r.max_score, 0)) * 100, 1)  as taux,
         round(sum(r.score), 2)                                 as total,
         max(r.created_at)                                      as derniere
    from service_records r
   where r.class_id = target_class
     and r.kind = 'aptitude'
     and r.score is not null
     and app_is_member(target_class)   -- rien ne sort d'un espace dont on n'est pas
   group by r.user_id
   order by 3 desc nulls last, 2 desc;
$$;

revoke all on function class_standings(uuid) from public, anon, authenticated;
grant execute on function class_standings(uuid) to authenticated;
