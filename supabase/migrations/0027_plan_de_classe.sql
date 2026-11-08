-- Le plan de classe de la séance : { user_id : numéro de place }.
-- Le professeur le fixe (règle sessions_write : l'encadrement seul) ; les
-- élèves, eux, choisissent leur place en séance, par la présence en direct,
-- et le plan du professeur l'emporte.
alter table public.class_sessions
  add column if not exists plan jsonb not null default '{}'::jsonb;
