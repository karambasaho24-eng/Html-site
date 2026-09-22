-- ============================================================================
-- CLASSE PARALLÈLE — Les objets de la scène
-- Migration 0011
--
-- Jusqu'ici tout était « un cahier ». Dans une scène jouée, on ne tend pas un
-- cahier comme on tend une feuille, on n'inspecte pas le sac de quelqu'un
-- comme on lit par-dessus son épaule, et un mot plié en quatre n'est pas un
-- registre. Les objets doivent exister séparément pour que la scène tienne.
--
-- Quatre ajouts : le support (ce qu'est l'objet), les repères et pense-bêtes
-- (ce qu'on y colle), le cartable (ce qu'on a apporté), et les papiers que
-- l'on se remet en main propre.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Le support : un cahier n'est pas une feuille
-- ---------------------------------------------------------------------------
do $$ begin
  create type support_kind as enum ('cahier', 'carnet', 'feuille', 'dossier');
exception when duplicate_object then null; end $$;

alter table notebooks add column if not exists support support_kind not null default 'cahier';
alter table notebooks add column if not exists max_pages int not null default 10;

-- Les supports existants gardent leur nature de cahier.
update notebooks set max_pages = 10 where max_pages is null or max_pages = 0;

-- ---------------------------------------------------------------------------
-- 2. Repères de page et pense-bêtes
--
-- « Mets un repère à la page trois » n'a de sens que si le repère se voit sur
-- la tranche, sans ouvrir. Et un pense-bête collé sur une page doit rester à
-- l'endroit où on l'a posé.
-- ---------------------------------------------------------------------------
alter table notebook_pages add column if not exists marker_color text;
alter table notebook_pages add column if not exists marker_label text;

create table if not exists sticky_notes (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references notebook_pages(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  body       text not null default '',
  color      text not null default 'jaune',
  x          numeric(6,3) not null default 0.7,   -- position relative sur la page
  y          numeric(6,3) not null default 0.1,
  rotation   numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sticky_notes_page_idx on sticky_notes(page_id);

drop trigger if exists sticky_notes_touch on sticky_notes;
create trigger sticky_notes_touch before update on sticky_notes
  for each row execute function touch_updated_at();

alter table sticky_notes enable row level security;

drop policy if exists sticky_read on sticky_notes;
create policy sticky_read on sticky_notes
  for select to authenticated using (app_can_read_notebook(
    (select notebook_id from notebook_pages where id = page_id)));

drop policy if exists sticky_write on sticky_notes;
create policy sticky_write on sticky_notes
  for all to authenticated
  using (app_can_write_notebook((select notebook_id from notebook_pages where id = page_id)))
  with check (app_can_write_notebook((select notebook_id from notebook_pages where id = page_id)));

-- ---------------------------------------------------------------------------
-- 3. Le cartable
--
-- L'instructeur dit « apportez votre cahier rouge ». Le cadet prépare ses
-- affaires avant d'entrer. S'il a oublié, cela se voit — et c'est une scène.
--
-- Le cartable sert aussi de frontière de confidentialité : un carnet qu'on a
-- apporté peut être inspecté, un carnet resté chez soi ne le peut pas.
-- ---------------------------------------------------------------------------
create table if not exists class_bags (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references classes(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  notebooks  jsonb not null default '[]'::jsonb,   -- identifiants des supports apportés
  supplies   jsonb not null default '[]'::jsonb,   -- trousse : stylos, encre, règle…
  updated_at timestamptz not null default now(),
  unique (class_id, user_id)
);

drop trigger if exists class_bags_touch on class_bags;
create trigger class_bags_touch before update on class_bags
  for each row execute function touch_updated_at();

alter table class_bags enable row level security;

drop policy if exists bags_read on class_bags;
create policy bags_read on class_bags
  for select to authenticated
  using (user_id = auth.uid() or app_is_staff(class_id));

drop policy if exists bags_self on class_bags;
create policy bags_self on class_bags
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and app_is_member(class_id));

-- La liste du matériel attendu, fixée par l'encadrement, vit dans les
-- réglages de la classe (settings.materiel).

-- ---------------------------------------------------------------------------
-- 4. Les papiers que l'on se remet
--
-- Un ordre de mission, une convocation, un laissez-passer. Ce n'est pas un
-- cahier : cela se rédige, cela se duplique, et cela se tend à quelqu'un qui
-- peut le refuser.
-- ---------------------------------------------------------------------------
do $$ begin
  create type paper_state as enum ('offered', 'accepted', 'refused', 'withdrawn');
exception when duplicate_object then null; end $$;

create table if not exists papers (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid references classes(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  title      text not null default 'Note',
  body       text not null default '',
  model      text not null default 'note',    -- note | ordre | convocation | laissez-passer | rapport
  seal       text,                            -- mention portée au cachet
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists papers_author_idx on papers(author_id, created_at desc);

drop trigger if exists papers_touch on papers;
create trigger papers_touch before update on papers
  for each row execute function touch_updated_at();

create table if not exists paper_handoffs (
  id         uuid primary key default gen_random_uuid(),
  paper_id   uuid not null references papers(id) on delete cascade,
  from_user  uuid not null references profiles(id) on delete cascade,
  to_user    uuid not null references profiles(id) on delete cascade,
  class_id   uuid references classes(id) on delete set null,
  session_id uuid references class_sessions(id) on delete set null,
  state      paper_state not null default 'offered',
  note       text,
  attested   boolean not null default false,   -- proximité attestée par l'émetteur
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists handoffs_to_idx   on paper_handoffs(to_user, created_at desc);
create index if not exists handoffs_from_idx on paper_handoffs(from_user, created_at desc);

alter table papers enable row level security;
alter table paper_handoffs enable row level security;

-- On lit un papier si on l'a écrit, ou si on nous l'a tendu.
drop policy if exists papers_read on papers;
create policy papers_read on papers
  for select to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from paper_handoffs h
      where h.paper_id = papers.id and h.to_user = auth.uid()
    )
    or (class_id is not null and app_is_staff(class_id))
  );

drop policy if exists papers_write on papers;
create policy papers_write on papers
  for all to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- On voit une remise qui nous concerne, d'un côté ou de l'autre.
drop policy if exists handoffs_read on paper_handoffs;
create policy handoffs_read on paper_handoffs
  for select to authenticated
  using (
    from_user = auth.uid() or to_user = auth.uid()
    or (class_id is not null and app_is_staff(class_id))
  );

drop policy if exists handoffs_offer on paper_handoffs;
create policy handoffs_offer on paper_handoffs
  for insert to authenticated
  with check (
    from_user = auth.uid()
    and exists (select 1 from papers p where p.id = paper_id and p.author_id = auth.uid())
  );

-- Le destinataire accepte ou refuse ; l'émetteur peut retirer son offre.
drop policy if exists handoffs_settle on paper_handoffs;
create policy handoffs_settle on paper_handoffs
  for update to authenticated
  using (to_user = auth.uid() or from_user = auth.uid())
  with check (to_user = auth.uid() or from_user = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['sticky_notes', 'class_bags', 'papers', 'paper_handoffs'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
             when undefined_object  then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Inspection d'un support apporté
--
-- L'encadrement a le droit de regarder ce qu'un membre a apporté — mais
-- seulement cela, et jamais sans que l'intéressé le sache. La procédure
-- vérifie que le support figure bien au cartable, puis inscrit l'inspection
-- au journal et prévient son propriétaire.
-- ---------------------------------------------------------------------------
create or replace function inspect_notebook(target_notebook uuid, target_class uuid)
returns notebooks
language plpgsql volatile security definer set search_path = public as $$
declare
  cahier notebooks;
  sac class_bags;
begin
  if not app_is_staff(target_class) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;

  select * into cahier from notebooks where id = target_notebook;
  if cahier.id is null then
    raise exception 'Support introuvable' using errcode = 'P0002';
  end if;

  select * into sac from class_bags
   where class_id = target_class and user_id = cahier.owner_id;

  if sac.id is null or not (sac.notebooks ? target_notebook::text) then
    raise exception 'Ce support n''a pas été apporté : il reste hors de portée.'
      using errcode = '42501';
  end if;

  insert into activity_logs (class_id, user_id, action, meta)
  values (target_class, auth.uid(), 'cahier.inspection',
          jsonb_build_object('cahier', target_notebook, 'proprietaire', cahier.owner_id));

  insert into notifications (user_id, class_id, kind, title, body, link)
  values (cahier.owner_id, target_class, 'inspection',
          'Votre ' || cahier.support::text || ' a été consulté',
          'L''encadrement a ouvert « ' || cahier.title || ' ».',
          '/classe/' || target_class::text);

  return cahier;
end $$;

revoke all on function inspect_notebook(uuid, uuid) from public, anon, authenticated;
grant execute on function inspect_notebook(uuid, uuid) to authenticated;

-- Lecture du contenu inspecté : le support apporté au cartable devient
-- lisible par l'encadrement de la classe où il a été apporté.
drop policy if exists notebooks_read on notebooks;
create policy notebooks_read on notebooks
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (class_id is not null and app_is_member(class_id))
    or exists (
      select 1 from class_bags b
      where b.user_id = notebooks.owner_id
        and b.notebooks ? notebooks.id::text
        and app_is_staff(b.class_id)
    )
  );
