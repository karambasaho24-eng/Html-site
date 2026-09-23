-- ---------------------------------------------------------------------------
-- 0016 — Tendre son cahier.
--
-- On pouvait déjà tendre un papier en main propre, et l'encadrement pouvait
-- demander un cahier. Entre les deux, rien : « tiens, regarde ma page 3 » et
-- « je te prête mon carnet » n'existaient pas, alors que ce sont deux gestes
-- de classe parmi les plus ordinaires.
--
-- Deux gestes, deux natures :
--
--   MONTRER ne laisse aucune trace ici. On tient la page sous les yeux de
--   quelqu'un, il regarde, on la reprend. Cela passe par le temps réel de la
--   séance, pas par une table : inscrire un regard en base lui donnerait une
--   permanence qu'il n'a pas.
--
--   PRÊTER ou DONNER, si. L'objet change de mains, et il faut savoir chez qui
--   il est. On ne force rien sur personne : l'autre accepte, ou refuse.
-- ---------------------------------------------------------------------------

do $$ begin
  create type notebook_handoff_kind as enum ('lend', 'give');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notebook_handoff_state as enum ('offered', 'accepted', 'refused', 'returned', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists notebook_handoffs (
  id          uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks(id) on delete cascade,
  from_user   uuid not null references profiles(id) on delete cascade,
  to_user     uuid not null references profiles(id) on delete cascade,
  class_id    uuid references classes(id) on delete set null,
  session_id  uuid references class_sessions(id) on delete set null,
  kind        notebook_handoff_kind  not null default 'lend',
  state       notebook_handoff_state not null default 'offered',
  note        text,
  attested    boolean not null default false,   -- proximité attestée par celui qui tend
  created_at  timestamptz not null default now(),
  settled_at  timestamptz
);
create index if not exists nb_handoffs_to_idx   on notebook_handoffs(to_user, created_at desc);
create index if not exists nb_handoffs_from_idx on notebook_handoffs(from_user, created_at desc);
-- Un seul prêt en cours par cahier : deux mains ne le tiennent pas ensemble.
create unique index if not exists nb_handoffs_en_cours
  on notebook_handoffs(notebook_id) where state in ('offered', 'accepted');

alter table notebook_handoffs enable row level security;

drop policy if exists nb_handoffs_read on notebook_handoffs;
create policy nb_handoffs_read on notebook_handoffs
  for select to authenticated
  using (
    from_user = auth.uid() or to_user = auth.uid()
    or (class_id is not null and app_is_staff(class_id))
  );

-- On ne tend que ce qu'on possède, et jamais à soi-même.
drop policy if exists nb_handoffs_offer on notebook_handoffs;
create policy nb_handoffs_offer on notebook_handoffs
  for insert to authenticated
  with check (
    from_user = auth.uid()
    and to_user <> auth.uid()
    and exists (select 1 from notebooks n where n.id = notebook_id and n.owner_id = auth.uid())
  );

-- Celui qui tend peut se raviser tant que rien n'est accepté ; celui à qui
-- l'on tend décide pour lui-même. L'acceptation, elle, passe par la fonction
-- plus bas : elle seule peut changer un propriétaire.
drop policy if exists nb_handoffs_settle on notebook_handoffs;
create policy nb_handoffs_settle on notebook_handoffs
  for update to authenticated
  using (from_user = auth.uid() or to_user = auth.uid())
  with check (state in ('refused', 'returned', 'cancelled'));

-- ---------------------------------------------------------------------------
-- Un cahier prêté se lit par celui qui l'a entre les mains.
--
-- On ajoute ce chemin à app_can_read_notebook plutôt que d'en inventer un
-- autre : les pages, les pense-bêtes et les annotations passent déjà tous
-- par cette fonction, et un objet prêté doit s'ouvrir partout ou nulle part.
--
-- Conséquence voulue : l'emprunteur peut écrire dans la marge, jamais dans
-- le texte. Prêter son cahier n'est pas le laisser récrire.
-- ---------------------------------------------------------------------------
create or replace function app_can_read_notebook(target_notebook uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from notebooks n
    where n.id = target_notebook
      and (
        n.owner_id = auth.uid()
        or (n.class_id is not null and app_is_member(n.class_id))
        or exists (
          select 1 from class_bags b
          where b.user_id = n.owner_id
            and b.notebooks ? n.id::text
            and app_is_staff(b.class_id)
        )
        or exists (
          select 1 from notebook_handoffs h
          where h.notebook_id = n.id
            and h.to_user = auth.uid()
            and h.state = 'accepted'
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Accepter ce qu'on nous tend.
--
-- Changer le propriétaire d'un cahier ne peut pas se faire par une simple
-- écriture : la politique d'écriture exige qu'on soit propriétaire avant ET
-- après, ce qu'un don rend impossible par construction. D'où cette fonction,
-- qui est le seul endroit du système où un cahier change de mains.
-- ---------------------------------------------------------------------------
create or replace function accept_notebook_handoff(handoff uuid)
returns notebook_handoffs
language plpgsql security definer set search_path = public as $$
declare ligne notebook_handoffs;
begin
  select * into ligne from notebook_handoffs where id = handoff for update;

  if ligne.id is null then
    raise exception 'Remise introuvable' using errcode = 'P0002';
  end if;
  if ligne.to_user <> auth.uid() then
    raise exception 'Ce cahier ne vous est pas tendu' using errcode = '42501';
  end if;
  if ligne.state <> 'offered' then
    raise exception 'Cette remise est déjà tranchée' using errcode = '42501';
  end if;

  -- Donné, il change de propriétaire. Prêté, il reste à son auteur : c'est
  -- toute la différence entre les deux gestes.
  if ligne.kind = 'give' then
    update notebooks set owner_id = ligne.to_user, updated_at = now()
     where id = ligne.notebook_id;
  end if;

  update notebook_handoffs
     set state = 'accepted', settled_at = now()
   where id = handoff
  returning * into ligne;

  return ligne;
end $$;

revoke all on function accept_notebook_handoff(uuid) from public, anon;
grant execute on function accept_notebook_handoff(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['notebook_handoffs'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
             when undefined_object  then null;
    end;
  end loop;
end $$;
