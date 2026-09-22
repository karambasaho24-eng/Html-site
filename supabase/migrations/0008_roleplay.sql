-- ============================================================================
-- CLASSE PARALLÈLE — Couche RolePlay
-- Migration 0008
--
-- Un outil scolaire branché sur un serveur RP produit du « HRP » — hors
-- roleplay — dès qu'il affiche le pseudo du joueur là où devrait figurer le
-- nom du personnage. On sépare donc les deux : le compte reste le compte, et
-- chaque membre tient une fiche de personnage propre à l'espace qu'il
-- fréquente. Un même joueur peut être cadet dans une brigade et instructeur
-- ailleurs, ce qui est exactement ce que font les serveurs.
-- ============================================================================

create table if not exists rp_profiles (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references classes(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  rank       text,          -- grade : cadet, caporal-chef, instructeur…
  corps      text,          -- corps ou unité de rattachement
  promotion  text,          -- brigade, promotion, session d'entraînement
  origin     text,          -- district, province, maison d'origine
  born       text,          -- naissance, telle que le personnage la dirait
  bio        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, user_id)
);
create index if not exists rp_profiles_class_idx on rp_profiles(class_id);

drop trigger if exists rp_profiles_touch on rp_profiles;
create trigger rp_profiles_touch before update on rp_profiles
  for each row execute function touch_updated_at();

alter table rp_profiles enable row level security;

-- Les membres d'un espace se connaissent : chacun lit les fiches des autres.
create policy rp_profiles_read on rp_profiles
  for select to authenticated using (app_is_member(class_id));

-- On écrit sa propre fiche ; l'encadrement peut corriger un grade ou un corps.
create policy rp_profiles_write on rp_profiles
  for insert to authenticated
  with check (user_id = auth.uid() and app_is_member(class_id));

create policy rp_profiles_update on rp_profiles
  for update to authenticated
  using (user_id = auth.uid() or app_is_staff(class_id))
  with check (user_id = auth.uid() or app_is_staff(class_id));

create policy rp_profiles_delete on rp_profiles
  for delete to authenticated
  using (user_id = auth.uid() or app_is_staff(class_id));

-- Diffusion : une promotion ou un changement d'unité doit se voir en séance.
do $$
begin
  begin
    alter publication supabase_realtime add table rp_profiles;
  exception when duplicate_object then null;
           when undefined_object  then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Un passage hors-roleplay se signale par la double parenthèse, convention
-- admise dans les communautés RP. La colonne permet de le savoir sans relire
-- le texte, pour filtrer un récapitulatif de séance par exemple.
-- ---------------------------------------------------------------------------
alter table session_questions add column if not exists out_of_character boolean not null default false;
alter table announcements     add column if not exists out_of_character boolean not null default false;
