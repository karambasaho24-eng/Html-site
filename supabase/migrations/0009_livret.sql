-- ============================================================================
-- CLASSE PARALLÈLE — Livret de service
-- Migration 0009
--
-- Une note sur vingt ne veut rien dire dans un corps militaire, et un cadet
-- n'a aucune raison de s'accrocher pour une moyenne. Ce qui fait tenir un RP
-- d'académie, c'est que les actes laissent des traces : une mention au
-- livret, un blâme, une promotion, un classement de promotion qui décide de
-- l'affectation.
--
-- Le livret donne à l'encadrement une autorité qui existe dans le monde, et
-- aux membres un dossier qui les suit. C'est du jeu, pas de l'administration.
-- ============================================================================

do $$ begin
  create type record_kind as enum ('mention', 'sanction', 'promotion', 'aptitude', 'note');
exception when duplicate_object then null; end $$;

create table if not exists service_records (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references classes(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  session_id uuid references class_sessions(id) on delete set null,
  kind       record_kind not null default 'note',
  label      text not null,             -- l'axe évalué, le motif, le grade obtenu
  body       text,                      -- le récit, rédigé dans le monde
  score      numeric(6,2),              -- pour une aptitude
  max_score  numeric(6,2),
  rank_to    text,                      -- pour une promotion : le nouveau grade
  created_at timestamptz not null default now()
);
create index if not exists service_records_class_idx on service_records(class_id, created_at desc);
create index if not exists service_records_user_idx  on service_records(class_id, user_id);

alter table service_records enable row level security;

-- Un membre lit son propre livret ; l'encadrement lit tout celui de son espace.
drop policy if exists records_read on service_records;
create policy records_read on service_records
  for select to authenticated
  using (user_id = auth.uid() or app_is_staff(class_id));

-- Seul l'encadrement écrit au livret. Un cadet ne se décerne pas ses mentions.
drop policy if exists records_write on service_records;
create policy records_write on service_records
  for all to authenticated
  using (app_is_staff(class_id)) with check (app_is_staff(class_id));

do $$
begin
  begin
    alter publication supabase_realtime add table service_records;
  exception when duplicate_object then null;
           when undefined_object  then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Une promotion inscrite au livret change réellement le grade porté sur la
-- fiche : sans cela, l'encadrement devrait le refaire à la main et les deux
-- finiraient par diverger.
-- ---------------------------------------------------------------------------
create or replace function apply_promotion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'promotion' and coalesce(btrim(new.rank_to), '') <> '' then
    update rp_profiles
       set rank = new.rank_to
     where class_id = new.class_id and user_id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists apply_promotion_trg on service_records;
create trigger apply_promotion_trg after insert on service_records
  for each row execute function apply_promotion();

-- ---------------------------------------------------------------------------
-- Classement de promotion : moyenne des aptitudes, par espace.
-- Le rang décide de l'affectation dans bien des univers — il doit donc être
-- lisible d'un coup d'œil, et calculé de la même façon pour tout le monde.
-- ---------------------------------------------------------------------------
create or replace view class_standings
with (security_invoker = true) as
  select class_id,
         user_id,
         count(*)::int                                            as evaluations,
         round(avg(score / nullif(max_score, 0)) * 100, 1)        as taux,
         round(sum(score), 2)                                     as total,
         max(created_at)                                          as derniere
    from service_records
   where kind = 'aptitude' and score is not null
   group by class_id, user_id;
