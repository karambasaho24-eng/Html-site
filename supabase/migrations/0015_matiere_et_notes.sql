-- ---------------------------------------------------------------------------
-- 0015 — Ce qu'on n'a pas apporté, ce que le maître écrit dans la marge,
--        et la note qu'on récolte.
--
-- Le cartable existait déjà, mais il ne faisait que constater : arriver les
-- mains vides se voyait sans rien empêcher. L'encadrement demande maintenant
-- que l'oubli ait un prix — sans quoi préparer ses affaires n'est qu'un décor.
-- Trois pièces manquaient :
--
--   1. la privation : sans de quoi écrire, on ne travaille pas, et le maître
--      seul décide qu'on peut aller chercher ce qu'on a laissé ;
--   2. l'annotation : le maître écrit SUR le cahier d'un cadet, dans la marge,
--      sans jamais pouvoir toucher à ce que le cadet a écrit ;
--   3. rien ici pour la note — la table grades existe depuis 0001 et n'avait
--      simplement jamais servi. On lui ajoute seulement ce qui manquait.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La privation de matériel
--
-- Une ligne par séance et par cadet. Elle naît quand il entre sans ce qui a
-- été demandé, et meurt quand le temps est purgé ou que le maître accorde le
-- laissez-passer. On garde l'état plutôt qu'un simple booléen : « il a
-- demandé » et « on lui a refusé » sont deux scènes différentes, et le refus
-- doit rester lisible dans le journal.
-- ---------------------------------------------------------------------------
do $$ begin
  create type supply_block_state as enum ('blocked', 'asked', 'granted', 'denied', 'lifted');
exception when duplicate_object then null; end $$;

create table if not exists supply_blocks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  class_id   uuid not null references classes(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  state      supply_block_state not null default 'blocked',
  minutes    int not null default 15,
  missing    jsonb not null default '[]'::jsonb,  -- ce qui manquait à l'entrée
  started_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles(id) on delete set null,
  note       text,
  unique (session_id, user_id)
);
create index if not exists supply_blocks_session_idx on supply_blocks(session_id);

alter table supply_blocks enable row level security;

-- Le cadet voit la sienne ; l'encadrement voit toute la séance. Personne
-- d'autre : qui a oublié sa plume ne regarde pas le sac du voisin.
drop policy if exists supply_blocks_read on supply_blocks;
create policy supply_blocks_read on supply_blocks
  for select to authenticated
  using (user_id = auth.uid() or app_is_staff(class_id));

-- Le cadet ne crée que la sienne, et seulement à l'état où il est vraiment :
-- privé, ou demandant. Il ne s'accorde pas son propre laissez-passer.
drop policy if exists supply_blocks_insert on supply_blocks;
create policy supply_blocks_insert on supply_blocks
  for insert to authenticated
  with check (
    (user_id = auth.uid() and state in ('blocked', 'asked'))
    or app_is_staff(class_id)
  );

drop policy if exists supply_blocks_update on supply_blocks;
create policy supply_blocks_update on supply_blocks
  for update to authenticated
  using (user_id = auth.uid() or app_is_staff(class_id))
  with check (
    app_is_staff(class_id)
    -- Le cadet ne peut que lever la main : passer de « privé » à « il demande ».
    or (user_id = auth.uid() and state in ('blocked', 'asked'))
  );

drop policy if exists supply_blocks_delete on supply_blocks;
create policy supply_blocks_delete on supply_blocks
  for delete to authenticated using (app_is_staff(class_id));

-- ---------------------------------------------------------------------------
-- 2. L'annotation dans la marge
--
-- « Le professeur peut écrire sur le cahier d'un élève — il écrit dessus,
-- rien de plus. » D'où une table à part plutôt qu'un droit d'écriture sur
-- notebook_pages : la copie du cadet reste intacte, mot pour mot, et la main
-- du maître se distingue toujours de la sienne. Une correction ne doit jamais
-- pouvoir se faire passer pour l'original.
-- ---------------------------------------------------------------------------
create table if not exists page_annotations (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references notebook_pages(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  body       text not null default '',
  ink        text not null default 'rouge',     -- la couleur de la main qui corrige
  anchor     text,                              -- le passage visé, cité tel quel
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists page_annotations_page_idx on page_annotations(page_id, created_at);

alter table page_annotations enable row level security;

-- Qui peut ouvrir le cahier lit ce qu'on y a corrigé — le propriétaire
-- d'abord. Une annotation qu'on ne verrait pas ne servirait à rien.
drop policy if exists page_annotations_read on page_annotations;
create policy page_annotations_read on page_annotations
  for select to authenticated
  using (app_can_read_notebook((select notebook_id from notebook_pages where id = page_id)));

-- On n'annote que ce qu'on a le droit d'ouvrir, et on ne signe que de son nom.
-- La même frontière que l'inspection : un cahier resté chez soi n'est ni lu
-- ni corrigé.
drop policy if exists page_annotations_write on page_annotations;
create policy page_annotations_write on page_annotations
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and app_can_read_notebook((select notebook_id from notebook_pages where id = page_id))
  );

-- Sa propre main, et rien d'autre : ni le cadet ne récrit la correction, ni
-- un maître celle d'un confrère.
drop policy if exists page_annotations_edit on page_annotations;
create policy page_annotations_edit on page_annotations
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists page_annotations_erase on page_annotations;
create policy page_annotations_erase on page_annotations
  for delete to authenticated using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. La note
--
-- La table grades est là depuis 0001 et n'a jamais servi : elle attendait un
-- écran. Il lui manquait seulement de quoi porter une note donnée à la main,
-- en séance, sans exercice derrière.
-- ---------------------------------------------------------------------------
alter table grades add column if not exists session_id uuid references class_sessions(id) on delete set null;
create index if not exists grades_session_idx on grades(session_id);

comment on column grades.source_kind is
  'exercise | manual | session — « manual » est la note portée de la main du maître.';

-- ---------------------------------------------------------------------------
-- 4. Le temps réel
--
-- Une décision du maître doit atteindre le cadet sans qu'il recharge la
-- salle : entre « demande transmise » et « vous pouvez y aller », il ne doit
-- pas y avoir de rechargement de page.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['supply_blocks', 'page_annotations', 'grades'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
             when undefined_object  then null;
    end;
  end loop;
end $$;
