-- ===========================================================================
-- 0020 — L'estrade : le professeur se tient-il devant la classe ?
--
-- Le site ne voit pas Roblox. C'est le professeur qui le dit, d'un geste :
-- « je suis devant la classe », « je quitte l'avant ». Les élèves le voient
-- aussitôt. Rien n'est déduit, tout est déclaré.
-- ===========================================================================
alter table class_sessions add column if not exists estrade jsonb not null default '{}'::jsonb;
comment on column class_sessions.estrade is
  'Présence déclarée du professeur à l''avant : { present, user_id, nom, at }';
