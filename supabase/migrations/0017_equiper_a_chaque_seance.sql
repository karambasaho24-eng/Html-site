-- ---------------------------------------------------------------------------
-- 0017 — S'équiper à chaque séance, sans refaire son sac chaque fois.
--
-- Le cartable était attaché à la CLASSE : préparé une fois, il restait
-- indéfiniment. Deux conséquences, toutes deux fausses :
--
--   — on pouvait arriver à vingt séances de suite sur un sac bouclé un soir
--     de septembre, sans jamais reposer le geste ;
--   — la privation, elle, se décide par séance. Elle s'appuyait donc sur une
--     donnée qui, elle, ne bougeait pas.
--
-- La correction ne consiste PAS à vider le sac entre deux cours. Personne ne
-- refait son cartable chaque matin : on vérifie qu'on l'a. Le chargement
-- reste donc permanent — c'est ce qu'on possède et ce qu'on emporte
-- d'habitude —, et on y ajoute la seule chose qui manquait : la trace du
-- moment où on l'a confirmé pour de bon.
--
-- Une colonne suffit. Si elle ne porte pas l'identifiant de la séance en
-- cours, c'est qu'on n'a pas encore ouvert son sac aujourd'hui.
-- ---------------------------------------------------------------------------
alter table class_bags
  add column if not exists last_session uuid references class_sessions(id) on delete set null;

alter table class_bags
  add column if not exists checked_at timestamptz;

create index if not exists class_bags_session_idx on class_bags(last_session);

comment on column class_bags.last_session is
  'Dernière séance pour laquelle le sac a été confirmé. Différent de la séance en cours = les affaires ne sont pas équipées.';
