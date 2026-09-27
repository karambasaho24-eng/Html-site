-- ============================================================================
-- CLASSE PARALLÈLE — Les affaires
-- Migration 0018
--
-- Jusqu'ici, « avoir une plume » était une chaîne de caractères dans un
-- tableau : class_bags.supplies contenait le mot « Plume ». On pouvait donc
-- l'avoir dans deux classes à la fois, la prêter sans s'en séparer, et la
-- perdre n'avait aucun sens puisqu'elle n'existait pas.
--
-- Un objet devient ici une LIGNE QUI APPARTIENT À QUELQU'UN et qui se trouve
-- QUELQUE PART. C'est tout ce qu'il faut pour que les gestes du jeu — poser,
-- ranger, emporter, tendre, prêter, rendre, oublier, confisquer — cessent
-- d'être des cases à cocher.
--
-- Ce qui ne change pas, et c'est voulu :
--
--   · class_bags reste la DÉCLARATION faite à une classe (« voilà ce que
--     j'apporte aujourd'hui »). C'est elle qui porte la frontière de
--     confidentialité de l'inspection, et on n'y touche pas.
--   · notebooks et papers gardent leurs propres remises. Un cahier n'est pas
--     une règle : il a des pages, une marge, un contenu lisible. Les fondre
--     dans une table d'objets génériques aurait coûté les politiques fines
--     déjà écrites pour eux.
--
-- Donc : belongings = ce que je possède et où c'est. class_bags = ce que j'ai
-- déclaré emporter. Deux questions différentes, deux tables.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Les objets
-- ---------------------------------------------------------------------------
do $$ begin
  create type belonging_state as enum ('owned', 'lent', 'borrowed', 'lost', 'confiscated');
exception when duplicate_object then null; end $$;

create table if not exists belongings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles(id) on delete cascade,

  -- `kind` est le type d'objet ('plume', 'regle-a-calcul'…). Le catalogue vit
  -- dans le code (src/features/affaires.js) et non en base : ajouter un objet
  -- ne doit pas demander une migration.
  kind         text not null,
  label        text not null default '',
  category     text not null default 'autre',

  -- Où il est. Un contenant est un objet comme un autre : la trousse est
  -- dans le cartable, la plume est dans la trousse.
  container_id uuid references belongings(id) on delete set null,
  is_container boolean not null default false,
  carried      boolean not null default false,   -- contenant : je le porte sur moi

  -- Consommable. `null` = ne se consomme pas. Seuls les objets pour lesquels
  -- la consommation se joue en ont un.
  level        int check (level is null or (level >= 0 and level <= 100)),
  quantity     int not null default 1 check (quantity >= 0),

  state        belonging_state not null default 'owned',
  holder_id    uuid references profiles(id) on delete set null,  -- qui l'a en main
  former_owner uuid references profiles(id) on delete set null,  -- « qui m'a donné ça ? »
  note         text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists belongings_owner_idx  on belongings(owner_id, category, kind);
create index if not exists belongings_holder_idx  on belongings(holder_id) where holder_id is not null;
create index if not exists belongings_boite_idx   on belongings(container_id) where container_id is not null;

drop trigger if exists belongings_touch on belongings;
create trigger belongings_touch before update on belongings
  for each row execute function touch_updated_at();

-- Un contenant ne se range pas dans lui-même, et rien ne se range dans un
-- objet qui n'est pas un contenant. La seconde règle demande un déclencheur :
-- une contrainte de colonne ne peut pas lire une autre ligne.
create or replace function belongings_check_container() returns trigger
language plpgsql as $$
declare hote belongings;
begin
  if new.container_id is null then return new; end if;
  if new.container_id = new.id then
    raise exception 'Un contenant ne se range pas dans lui-même' using errcode = '22023';
  end if;
  select * into hote from belongings where id = new.container_id;
  if hote.id is null or not hote.is_container then
    raise exception 'Cet objet n''est pas un contenant' using errcode = '22023';
  end if;
  if hote.owner_id <> new.owner_id then
    raise exception 'On ne range pas ses affaires chez quelqu''un d''autre' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists belongings_container_guard on belongings;
create trigger belongings_container_guard before insert or update of container_id on belongings
  for each row execute function belongings_check_container();

alter table belongings enable row level security;

drop policy if exists belongings_create on belongings;
create policy belongings_create on belongings
  for insert to authenticated with check (owner_id = auth.uid());

-- Le propriétaire range, renomme, consomme. Il ne change PAS de propriétaire
-- par une écriture directe : la politique exige d'être propriétaire avant et
-- après, ce qu'un don rend impossible. Le transfert a sa fonction.
drop policy if exists belongings_write on belongings;
create policy belongings_write on belongings
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists belongings_drop on belongings;
create policy belongings_drop on belongings
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Ce qui passe de main en main
--
-- Deux directions dans une seule table, parce que c'est le même geste vu des
-- deux bouts : « tiens, prends ma règle » et « tu me prêtes ta règle ? »
-- aboutissent au même transfert. Les séparer aurait dédoublé la fonction
-- d'acceptation, et donc les occasions de se tromper.
-- ---------------------------------------------------------------------------
do $$ begin
  create type belonging_handoff_kind as enum ('lend', 'give');
exception when duplicate_object then null; end $$;

do $$ begin
  create type belonging_handoff_dir as enum ('offer', 'request');
exception when duplicate_object then null; end $$;

do $$ begin
  create type belonging_handoff_state as enum
    ('offered', 'accepted', 'refused', 'returned', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists belonging_handoffs (
  id           uuid primary key default gen_random_uuid(),
  -- Nul pour une demande ouverte : on demande « une règle », pas « cette
  -- règle-là », et c'est le propriétaire qui choisit laquelle il sort.
  belonging_id uuid references belongings(id) on delete cascade,
  asked_kind   text,
  asked_label  text,
  from_user    uuid not null references profiles(id) on delete cascade,
  to_user      uuid not null references profiles(id) on delete cascade,
  class_id     uuid references classes(id) on delete set null,
  session_id   uuid references class_sessions(id) on delete set null,
  kind         belonging_handoff_kind  not null default 'lend',
  direction    belonging_handoff_dir   not null default 'offer',
  state        belonging_handoff_state not null default 'offered',
  note         text,
  attested     boolean not null default false,
  created_at   timestamptz not null default now(),
  settled_at   timestamptz,
  check (belonging_id is not null or asked_kind is not null),
  check (from_user <> to_user)
);
create index if not exists bh_to_idx   on belonging_handoffs(to_user, created_at desc);
create index if not exists bh_from_idx on belonging_handoffs(from_user, created_at desc);

-- Un objet ne part pas deux fois. C'est la garantie contre la duplication :
-- tant qu'une remise est offerte ou acceptée, aucune autre ne peut naître.
create unique index if not exists bh_en_cours
  on belonging_handoffs(belonging_id)
  where belonging_id is not null and state in ('offered', 'accepted');

alter table belonging_handoffs enable row level security;

drop policy if exists bh_read on belonging_handoffs;
create policy bh_read on belonging_handoffs
  for select to authenticated
  using (
    from_user = auth.uid() or to_user = auth.uid()
    or (class_id is not null and app_is_staff(class_id))
  );

-- On ne tend que ce qu'on a en main ; on demande ce qu'on veut.
drop policy if exists bh_offer on belonging_handoffs;
create policy bh_offer on belonging_handoffs
  for insert to authenticated
  with check (
    from_user = auth.uid()
    and (
      direction = 'request'
      or exists (
        select 1 from belongings b
        where b.id = belonging_id
          and b.owner_id = auth.uid()
          and b.state in ('owned', 'borrowed')
      )
    )
  );

-- Refuser, rendre, se raviser : chacun pour ce qui le concerne. L'acceptation
-- passe par la fonction, elle seule peut déplacer un objet.
drop policy if exists bh_settle on belonging_handoffs;
create policy bh_settle on belonging_handoffs
  for update to authenticated
  using (from_user = auth.uid() or to_user = auth.uid())
  with check (state in ('refused', 'cancelled'));

-- On voit ses propres affaires, celles qu'on a en main, et celles qu'on nous
-- tend (sinon on refuserait un objet sans savoir lequel). Rien d'autre : ce
-- qui reste chez quelqu'un ne se consulte pas à distance, et l'inspection
-- passe toujours par le cartable déclaré.
drop policy if exists belongings_read on belongings;
create policy belongings_read on belongings
  for select to authenticated
  using (
    owner_id = auth.uid()
    or holder_id = auth.uid()
    or exists (
      select 1 from belonging_handoffs h
      where h.belonging_id = belongings.id
        and (h.to_user = auth.uid() or h.from_user = auth.uid())
        and h.state in ('offered', 'accepted')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Accepter — le seul endroit où un objet change de mains
-- ---------------------------------------------------------------------------
create or replace function accept_belonging_handoff(handoff uuid, chosen uuid default null)
returns belonging_handoffs
language plpgsql security definer set search_path = public as $$
declare
  ligne  belonging_handoffs;
  objet  belongings;
  cible  uuid;   -- qui reçoit
  source uuid;   -- qui se sépare
begin
  select * into ligne from belonging_handoffs where id = handoff for update;
  if ligne.id is null then
    raise exception 'Remise introuvable' using errcode = 'P0002';
  end if;
  if ligne.state <> 'offered' then
    raise exception 'Cette remise est déjà tranchée' using errcode = '42501';
  end if;

  -- On tend : c'est le destinataire qui accepte.
  -- On demande : c'est le propriétaire sollicité qui accepte, et qui désigne
  -- l'objet qu'il sort de son sac.
  if ligne.direction = 'offer' then
    if ligne.to_user <> auth.uid() then
      raise exception 'Cet objet ne vous est pas tendu' using errcode = '42501';
    end if;
    cible := ligne.to_user; source := ligne.from_user;
  else
    if ligne.to_user <> auth.uid() then
      raise exception 'Cette demande ne vous est pas adressée' using errcode = '42501';
    end if;
    cible := ligne.from_user; source := ligne.to_user;
  end if;

  select * into objet from belongings
   where id = coalesce(chosen, ligne.belonging_id) for update;
  if objet.id is null then
    raise exception 'Objet introuvable' using errcode = 'P0002';
  end if;
  if objet.owner_id <> source then
    raise exception 'Cet objet n''est pas à celui qui s''en sépare' using errcode = '42501';
  end if;
  if objet.state = 'confiscated' then
    raise exception 'Cet objet est confisqué' using errcode = '42501';
  end if;

  -- Il quitte le sac de celui qui s'en sépare : un objet prêté ne reste pas
  -- rangé dans la trousse de son propriétaire.
  if ligne.kind = 'give' then
    update belongings
       set owner_id = cible, former_owner = source, holder_id = null,
           state = 'owned', container_id = null, carried = false
     where id = objet.id;
  else
    update belongings
       set holder_id = cible, state = 'lent', container_id = null, carried = false
     where id = objet.id;
  end if;

  update belonging_handoffs
     set state = 'accepted', settled_at = now(), belonging_id = objet.id
   where id = handoff
  returning * into ligne;

  insert into notifications (user_id, class_id, kind, title, body, link)
  values (source, ligne.class_id, 'affaires',
          case when ligne.kind = 'give' then 'Votre objet a été accepté'
               else 'Votre prêt a été accepté' end,
          coalesce(nullif(objet.label, ''), objet.kind), '/affaires');

  return ligne;
end $$;

revoke all on function accept_belonging_handoff(uuid, uuid) from public, anon;
grant execute on function accept_belonging_handoff(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rendre
--
-- L'emprunteur rend, ou le prêteur récupère : les deux gestes existent, et
-- tous deux ramènent l'objet chez son propriétaire, hors de tout contenant —
-- il vient d'être rendu, il n'est pas encore rangé.
-- ---------------------------------------------------------------------------
create or replace function return_belonging_handoff(handoff uuid)
returns belonging_handoffs
language plpgsql security definer set search_path = public as $$
declare ligne belonging_handoffs; objet belongings;
begin
  select * into ligne from belonging_handoffs where id = handoff for update;
  if ligne.id is null then
    raise exception 'Remise introuvable' using errcode = 'P0002';
  end if;
  if ligne.from_user <> auth.uid() and ligne.to_user <> auth.uid() then
    raise exception 'Cette remise ne vous concerne pas' using errcode = '42501';
  end if;
  if ligne.state <> 'accepted' then
    raise exception 'Il n''y a rien à rendre' using errcode = '42501';
  end if;
  if ligne.kind <> 'lend' then
    raise exception 'Un objet donné ne se reprend pas : il faut le redemander'
      using errcode = '42501';
  end if;

  select * into objet from belongings where id = ligne.belonging_id for update;
  update belongings
     set holder_id = null, state = 'owned', container_id = null, carried = false
   where id = ligne.belonging_id;

  update belonging_handoffs set state = 'returned', settled_at = now()
   where id = handoff returning * into ligne;

  insert into notifications (user_id, class_id, kind, title, body, link)
  values (case when auth.uid() = objet.owner_id then ligne.to_user else objet.owner_id end,
          ligne.class_id, 'affaires', 'Prêt rendu',
          coalesce(nullif(objet.label, ''), objet.kind), '/affaires');

  return ligne;
end $$;

revoke all on function return_belonging_handoff(uuid) from public, anon;
grant execute on function return_belonging_handoff(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Confisquer
--
-- Jamais automatique : c'est un geste d'autorité, prononcé dans la scène puis
-- porté ici. L'objet reste au cadet — on ne le lui vole pas — mais il n'en
-- dispose plus, et il sait qui l'a et pourquoi.
-- ---------------------------------------------------------------------------
create or replace function confiscate_belonging(target uuid, target_class uuid, motif text default null)
returns belongings
language plpgsql security definer set search_path = public as $$
declare objet belongings;
begin
  if not app_is_staff(target_class) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;
  select * into objet from belongings where id = target for update;
  if objet.id is null then
    raise exception 'Objet introuvable' using errcode = 'P0002';
  end if;
  if not app_is_member(target_class) or not exists (
    select 1 from class_members m
     where m.class_id = target_class and m.user_id = objet.owner_id and m.status = 'active'
  ) then
    raise exception 'Cette personne n''est pas de cet espace' using errcode = '42501';
  end if;
  -- On ne confisque que ce qui a été apporté : un objet resté chez soi est
  -- hors de portée, exactement comme un cahier non déclaré au cartable.
  if not exists (
    select 1 from class_bags b
     where b.class_id = target_class and b.user_id = objet.owner_id
       and b.supplies ? objet.id::text
  ) then
    raise exception 'Cet objet n''a pas été apporté : il reste hors de portée.'
      using errcode = '42501';
  end if;

  update belongings
     set state = 'confiscated', holder_id = auth.uid(),
         note = coalesce(motif, note), container_id = null, carried = false
   where id = target returning * into objet;

  insert into activity_logs (class_id, user_id, action, meta)
  values (target_class, auth.uid(), 'affaires.confiscation',
          jsonb_build_object('objet', target, 'proprietaire', objet.owner_id, 'motif', motif));

  insert into notifications (user_id, class_id, kind, title, body, link)
  values (objet.owner_id, target_class, 'affaires', 'Un objet vous a été confisqué',
          coalesce(nullif(objet.label, ''), objet.kind)
            || coalesce(' — ' || nullif(trim(motif), ''), ''),
          '/affaires');

  return objet;
end $$;

revoke all on function confiscate_belonging(uuid, uuid, text) from public, anon;
grant execute on function confiscate_belonging(uuid, uuid, text) to authenticated;

create or replace function release_belonging(target uuid)
returns belongings
language plpgsql security definer set search_path = public as $$
declare objet belongings;
begin
  select * into objet from belongings where id = target for update;
  if objet.id is null then
    raise exception 'Objet introuvable' using errcode = 'P0002';
  end if;
  if objet.state <> 'confiscated' or objet.holder_id <> auth.uid() then
    raise exception 'Vous ne détenez pas cet objet' using errcode = '42501';
  end if;
  update belongings set state = 'owned', holder_id = null
   where id = target returning * into objet;

  insert into notifications (user_id, kind, title, body, link)
  values (objet.owner_id, 'affaires', 'On vous rend votre objet',
          coalesce(nullif(objet.label, ''), objet.kind), '/affaires');
  return objet;
end $$;

revoke all on function release_belonging(uuid) from public, anon;
grant execute on function release_belonging(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Le matériel demandé, séance par séance
--
-- La consigne vivait dans les réglages de la classe. Elle valait donc pour
-- toutes les séances à la fois, passées comprises : changer la demande du
-- jour réécrivait ce qu'on avait demandé le mois dernier. Une séance garde
-- désormais la sienne ; vide, elle retombe sur celle de la classe.
-- ---------------------------------------------------------------------------
alter table class_sessions add column if not exists materiel jsonb;

comment on column class_sessions.materiel is
  'Matériel demandé pour CETTE séance. Nul = on applique celui de la classe.';

do $$
declare t text;
begin
  foreach t in array array['belongings', 'belonging_handoffs'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
             when undefined_object  then null;
    end;
  end loop;
end $$;
