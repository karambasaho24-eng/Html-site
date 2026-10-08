-- ============================================================================
-- CLASSE PARALLÈLE — La place des choses
-- Migration 0019
--
-- Jusqu'ici, un objet était « à moi » ou « pas à moi ». Cela ne suffit pas à
-- jouer : un stylo que je possède mais que j'ai oublié sur le bureau de la
-- salle 3 ne me sert à rien ici. L'inventaire ne doit donc pas dire ce que je
-- possède, mais ce que j'ai SOUS LA MAIN.
--
-- Trois lieux, et pas un de plus :
--
--   · range  — rangé : dans un contenant (le sac, la trousse, un dossier) ou
--              chez soi. C'est `container_id` qui dit lequel ;
--   · bureau — sorti du sac et posé devant soi, pendant UNE activité. Seul ce
--              qui est sur le bureau sert : on n'écrit pas avec un stylo
--              resté au fond du cartable ;
--   · salle  — laissé derrière soi. L'objet reste dans la salle ; il ne
--              revient pas tout seul, et on ne le récupère pas à distance.
--
-- Et une contrainte de volume : le sac a une capacité. Un boulier prend de la
-- place, une plume presque pas. On choisit ce qu'on emporte.
--
-- Les cahiers suivent exactement les mêmes règles. Un cahier oublié en salle
-- n'est pas « à moi quand même » : il est là-bas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Les colonnes du lieu et du volume
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['belongings', 'notebooks'] loop
    execute format($f$
      alter table %I add column if not exists place text not null default 'range';
      alter table %I add column if not exists place_session uuid references class_sessions(id) on delete set null;
      alter table %I add column if not exists place_class uuid references classes(id) on delete set null;
      alter table %I add column if not exists place_label text;
      alter table %I add column if not exists place_at timestamptz;
      alter table %I add column if not exists size int not null default 1;
    $f$, t, t, t, t, t, t);
    begin
      execute format('alter table %I add constraint %I check (place in (''range'', ''bureau'', ''salle''))',
                     t, t || '_place_valide');
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Un cahier se range dans un contenant, comme le reste.
alter table notebooks add column if not exists container_id uuid references belongings(id) on delete set null;
create index if not exists notebooks_boite_idx on notebooks(container_id) where container_id is not null;

alter table belongings add column if not exists capacity int;

-- Le volume de ce qui existe déjà. Le catalogue vit dans le code
-- (src/features/affaires.js) ; ces valeurs en sont la copie, pour que la base
-- puisse refuser un sac trop plein sans croire l'interface sur parole.
update belongings set size = case kind
    when 'plume' then 1 when 'stylo-plume' then 1 when 'crayon' then 1
    when 'craie' then 1 when 'gomme' then 1 when 'buvard' then 2
    when 'encrier' then 2 when 'encre' then 2 when 'regle' then 2
    when 'equerre' then 2 when 'compas' then 2 when 'rapporteur' then 2
    when 'feuilles' then 2 when 'regle-a-calcul' then 3 when 'boulier' then 8
    when 'trousse' then 4 when 'etui' then 3 when 'chemise' then 2
    when 'pochette' then 3 when 'dossier' then 3 when 'registre' then 5
    when 'cachet' then 2 when 'carte' then 1 when 'boussole' then 1
    when 'lorgnette' then 3 when 'lanterne' then 6 when 'montre' then 1
    when 'gourde' then 4 when 'cartable' then 12 when 'sacoche' then 8
    when 'musette' then 10 when 'mallette' then 12 when 'boite' then 10
    else size end;

update belongings set capacity = case kind
    when 'cartable' then 24 when 'musette' then 20 when 'mallette' then 20
    when 'sacoche' then 12 when 'boite' then 30 when 'trousse' then 8
    when 'etui' then 6 when 'pochette' then 6 when 'chemise' then 4
    when 'dossier' then 6 else capacity end
 where is_container and capacity is null;

update notebooks set size = case support
    when 'feuille' then 1 when 'carnet' then 3 when 'cahier' then 4
    when 'dossier' then 5 else 4 end;

-- ---------------------------------------------------------------------------
-- 2. Ce que contient un contenant, et la place qui reste
-- ---------------------------------------------------------------------------
create or replace function app_contenu_taille(target uuid, sauf uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select sum(size) from belongings
                    where container_id = target and id is distinct from sauf), 0)
       + coalesce((select sum(size) from notebooks
                    where container_id = target and id is distinct from sauf), 0)
$$;

-- ---------------------------------------------------------------------------
-- 3. Le garde du lieu
--
-- Un seul déclencheur pour les deux tables, parce que c'est la même règle :
--   · on ne range que dans un contenant à soi, et s'il reste de la place ;
--   · ranger quelque chose le remet « rangé » — on ne peut pas être à la fois
--     dans la trousse et sur le bureau ;
--   · on ne sort sur le bureau que ce qui est dans le sac qu'on porte ;
--   · ce qui est resté en salle n'en bouge que par une procédure de
--     récupération. Changer une colonne ne suffit pas à traverser les murs.
-- ---------------------------------------------------------------------------
create or replace function app_dans_le_sac(target uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare courant uuid := target; b belongings; i int := 0;
begin
  while courant is not null and i < 8 loop
    select * into b from belongings where id = courant;
    if b.id is null then return false; end if;
    if b.carried and b.place = 'range' then return true; end if;
    courant := b.container_id; i := i + 1;
  end loop;
  return false;
end $$;

create or replace function app_garde_du_lieu() returns trigger
language plpgsql as $$
declare
  hote belongings;
  proprietaire uuid := new.owner_id;
  recuperation boolean := coalesce(current_setting('app.recuperation', true), '') = 'on';
begin
  -- Ce qui est en salle y reste, sauf procédure de récupération.
  if tg_op = 'UPDATE' and old.place = 'salle' and not recuperation then
    if new.place <> 'salle' or new.container_id is distinct from old.container_id then
      raise exception 'Cet objet est resté en salle : il faut aller le récupérer.'
        using errcode = '42501';
    end if;
  end if;

  if new.container_id is not null then
    if new.container_id = new.id then
      raise exception 'Un contenant ne se range pas dans lui-même' using errcode = '22023';
    end if;
    select * into hote from belongings where id = new.container_id;
    if hote.id is null or not hote.is_container then
      raise exception 'Cet objet n''est pas un contenant' using errcode = '22023';
    end if;
    if hote.owner_id <> proprietaire then
      raise exception 'On ne range pas ses affaires chez quelqu''un d''autre' using errcode = '42501';
    end if;
    if hote.capacity is not null
       and (tg_op = 'INSERT' or new.container_id is distinct from old.container_id
            or new.size > old.size)
       and app_contenu_taille(new.container_id, new.id) + new.size > hote.capacity then
      raise exception 'Il n''y a plus de place dans %', coalesce(nullif(hote.label, ''), hote.kind)
        using errcode = '22023';
    end if;
    -- Rangé, donc ni sur le bureau ni en salle.
    new.place := 'range';
    new.place_session := null; new.place_class := null;
    new.place_label := null; new.place_at := null;
  end if;

  -- On ne sort sur le bureau que ce qu'on a dans son sac.
  if new.place = 'bureau' and (tg_op = 'INSERT' or old.place <> 'bureau') then
    -- Une remise en main propre pose l'objet sur le bureau de celui qui le
    -- reçoit : c'est la procédure qui le décide, pas le propriétaire.
    if tg_op = 'UPDATE' and old.place = 'range' and not recuperation
       and (old.container_id is null or not app_dans_le_sac(old.container_id)) then
      raise exception 'On ne sort que ce qu''on a dans son sac.' using errcode = '42501';
    end if;
    if new.place_session is null then
      raise exception 'Sortir un objet suppose une activité en cours' using errcode = '22023';
    end if;
    new.place_at := now();
  end if;

  if new.place = 'salle' and (tg_op = 'INSERT' or old.place <> 'salle') then
    if new.place_class is null then
      raise exception 'Un objet laissé en salle doit dire laquelle' using errcode = '22023';
    end if;
    new.place_at := now();
  end if;
  return new;
end $$;

-- L'ancien garde des contenants est remplacé : il ne connaissait ni le volume
-- ni les lieux.
drop trigger if exists belongings_container_guard on belongings;
drop trigger if exists belongings_garde_du_lieu on belongings;
create trigger belongings_garde_du_lieu
  before insert or update on belongings
  for each row execute function app_garde_du_lieu();

drop trigger if exists notebooks_garde_du_lieu on notebooks;
create trigger notebooks_garde_du_lieu
  before insert or update of place, container_id, size, place_session, place_class on notebooks
  for each row execute function app_garde_du_lieu();

-- On ne tend pas ce qu'on n'a pas sous la main.
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
          and b.place <> 'salle'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. La salle est-elle ouverte ?
--
-- Ouverte si une séance y est en cours, si l'encadrement l'a ouverte pour un
-- temps, ou s'il a donné à cette personne un laissez-passer. Rien d'autre :
-- une salle fermée est fermée.
-- ---------------------------------------------------------------------------
create or replace function app_salle_ouverte(target_class uuid, pour uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_sessions s where s.class_id = target_class and s.status = 'live')
      or exists (
        select 1 from classes c where c.id = target_class and (
          coalesce((c.settings->>'salle_ouverte_jusqua')::timestamptz, 'epoch') > now()
          or coalesce((c.settings->'passes'->>pour::text)::timestamptz, 'epoch') > now()
        )
      )
$$;

-- ---------------------------------------------------------------------------
-- 5. Récupérer ce qu'on a laissé
--
-- Il faut que la salle soit ouverte ; la proximité, elle, est attestée par le
-- joueur avant l'appel, comme partout ailleurs. L'objet revient DANS LE SAC
-- s'il y a de la place, sinon dans les mains — on ne jette pas un cahier
-- parce que le cartable est plein.
-- ---------------------------------------------------------------------------
create or replace function app_sac_avec_place(proprietaire uuid, besoin int)
returns uuid language sql stable security definer set search_path = public as $$
  select b.id from belongings b
   where b.owner_id = proprietaire and b.is_container and b.carried and b.place = 'range'
     and b.state in ('owned', 'borrowed')
     and coalesce(b.capacity, 0) - app_contenu_taille(b.id) >= besoin
   order by b.capacity desc nulls last
   limit 1
$$;

create or replace function recover_belonging(target uuid)
returns belongings language plpgsql security definer set search_path = public as $$
declare objet belongings; classe uuid;
begin
  select * into objet from belongings where id = target for update;
  if objet.id is null then raise exception 'Objet introuvable' using errcode = 'P0002'; end if;
  if objet.owner_id <> auth.uid() and objet.holder_id is distinct from auth.uid() then
    raise exception 'Cet objet n''est pas à vous' using errcode = '42501';
  end if;
  if objet.place = 'range' then return objet; end if;
  classe := objet.place_class;
  if classe is null or not app_salle_ouverte(classe) then
    raise exception 'La salle est fermée : l''objet y reste.' using errcode = '42501';
  end if;
  perform set_config('app.recuperation', 'on', true);
  update belongings
     set place = 'range', place_session = null, place_class = null,
         place_label = null, place_at = null,
         container_id = app_sac_avec_place(objet.owner_id, objet.size)
   where id = target returning * into objet;
  perform set_config('app.recuperation', 'off', true);
  return objet;
end $$;

create or replace function recover_notebook(target uuid)
returns notebooks language plpgsql security definer set search_path = public as $$
declare cahier notebooks; classe uuid;
begin
  select * into cahier from notebooks where id = target for update;
  if cahier.id is null then raise exception 'Support introuvable' using errcode = 'P0002'; end if;
  if cahier.owner_id <> auth.uid() then
    raise exception 'Ce support n''est pas à vous' using errcode = '42501';
  end if;
  if cahier.place = 'range' then return cahier; end if;
  classe := cahier.place_class;
  if classe is null or not app_salle_ouverte(classe) then
    raise exception 'La salle est fermée : le cahier y reste.' using errcode = '42501';
  end if;
  perform set_config('app.recuperation', 'on', true);
  update notebooks
     set place = 'range', place_session = null, place_class = null,
         place_label = null, place_at = null,
         container_id = app_sac_avec_place(cahier.owner_id, cahier.size)
   where id = target returning * into cahier;
  perform set_config('app.recuperation', 'off', true);
  return cahier;
end $$;

-- ---------------------------------------------------------------------------
-- 6. L'encadrement : voir ce qui traîne, et le rendre
-- ---------------------------------------------------------------------------
create or replace function forgotten_in_class(target_class uuid)
returns table (genre text, id uuid, owner_id uuid, kind text, label text, place text, place_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app_is_staff(target_class) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;
  return query
    select 'objet'::text, b.id, b.owner_id, b.kind, b.label, b.place, b.place_at
      from belongings b
     where b.place_class = target_class and b.place in ('salle', 'bureau')
    union all
    select 'cahier'::text, n.id, n.owner_id, n.support::text, n.title, n.place, n.place_at
      from notebooks n
     where n.place_class = target_class and n.place in ('salle', 'bureau')
    order by 7 desc;
end $$;

create or replace function restitute_forgotten(genre text, target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare classe uuid; proprietaire uuid; taille int; nom text;
begin
  if genre = 'cahier' then
    select place_class, owner_id, size, title into classe, proprietaire, taille, nom
      from notebooks where id = target;
  else
    select place_class, owner_id, size, coalesce(nullif(label, ''), kind)
      into classe, proprietaire, taille, nom from belongings where id = target;
  end if;
  if classe is null then raise exception 'Rien à rendre' using errcode = 'P0002'; end if;
  if not app_is_staff(classe) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;

  perform set_config('app.recuperation', 'on', true);
  if genre = 'cahier' then
    update notebooks set place = 'range', place_session = null, place_class = null,
           place_label = null, place_at = null,
           container_id = app_sac_avec_place(proprietaire, taille)
     where id = target;
  else
    update belongings set place = 'range', place_session = null, place_class = null,
           place_label = null, place_at = null,
           container_id = app_sac_avec_place(proprietaire, taille)
     where id = target;
  end if;
  perform set_config('app.recuperation', 'off', true);

  insert into notifications (user_id, class_id, kind, title, body, link)
  values (proprietaire, classe, 'affaires', 'On vous a rendu ce que vous aviez oublié',
          nom, '/affaires');
  insert into activity_logs (class_id, user_id, action, meta)
  values (classe, auth.uid(), 'affaires.restitution',
          jsonb_build_object('genre', genre, 'objet', target, 'proprietaire', proprietaire));
  return true;
end $$;

-- L'encadrement voit ce qui traîne dans SA salle — et seulement cela.
drop policy if exists belongings_read on belongings;
create policy belongings_read on belongings
  for select to authenticated
  using (
    owner_id = auth.uid()
    or holder_id = auth.uid()
    or (place <> 'range' and place_class is not null and app_is_staff(place_class))
    or exists (
      select 1 from belonging_handoffs h
      where h.belonging_id = belongings.id
        and (h.to_user = auth.uid() or h.from_user = auth.uid())
        and h.state in ('offered', 'accepted')
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Les dossiers
--
-- Un dossier est un objet — il a une place, il tient dans un sac, il se
-- tend — et il contient des papiers. On ne déplace pas les papiers : on les
-- range dans le dossier. Qui tient le dossier les lit ; qui l'a oublié en
-- salle ne les a plus.
-- ---------------------------------------------------------------------------
create table if not exists dossier_items (
  id         uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references belongings(id) on delete cascade,
  paper_id   uuid not null references papers(id) on delete cascade,
  added_by   uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dossier_id, paper_id)
);
create index if not exists dossier_items_papier_idx on dossier_items(paper_id);

alter table dossier_items enable row level security;

create or replace function app_tient_le_dossier(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from belongings b
                  where b.id = target and (b.owner_id = auth.uid() or b.holder_id = auth.uid()))
$$;

drop policy if exists dossier_items_read on dossier_items;
create policy dossier_items_read on dossier_items
  for select to authenticated using (app_tient_le_dossier(dossier_id));

drop policy if exists dossier_items_write on dossier_items;
create policy dossier_items_write on dossier_items
  for all to authenticated
  using (app_tient_le_dossier(dossier_id))
  with check (
    app_tient_le_dossier(dossier_id)
    and exists (
      select 1 from papers p where p.id = paper_id and (
        p.author_id = auth.uid()
        or exists (select 1 from paper_handoffs h
                    where h.paper_id = p.id and h.to_user = auth.uid() and h.state = 'accepted')
        or exists (select 1 from dossier_items d2
                    where d2.paper_id = p.id and app_tient_le_dossier(d2.dossier_id))
      )
    )
  );

-- Un papier se lit aussi par qui tient le dossier qui le contient.
drop policy if exists papers_read on papers;
create policy papers_read on papers
  for select to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from paper_handoffs h where h.paper_id = papers.id and h.to_user = auth.uid())
    or (class_id is not null and app_is_staff(class_id))
    or exists (select 1 from dossier_items d where d.paper_id = papers.id
                and app_tient_le_dossier(d.dossier_id))
  );

do $$
declare f text;
begin
  foreach f in array array['recover_belonging(uuid)', 'recover_notebook(uuid)',
                           'forgotten_in_class(uuid)', 'restitute_forgotten(text, uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table dossier_items';
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Ce qu'on tend arrive dans les mains
--
-- Un stylo prêté en pleine séance arrive SUR LE BUREAU de celui qui le reçoit :
-- c'est tout l'intérêt du geste, il doit pouvoir écrire aussitôt. Hors séance,
-- il arrive dans les mains, c'est-à-dire rangé nulle part — à lui de le mettre
-- dans son sac.
-- ---------------------------------------------------------------------------
create or replace function app_lieu_de_remise(ligne belonging_handoffs)
returns text language sql stable security definer set search_path = public as $$
  select case when ligne.session_id is not null and exists (
                select 1 from class_sessions s where s.id = ligne.session_id and s.status = 'live')
              then 'bureau' else 'range' end
$$;

create or replace function accept_belonging_handoff(handoff uuid, chosen uuid default null)
returns belonging_handoffs
language plpgsql security definer set search_path = public as $$
declare
  ligne  belonging_handoffs;
  objet  belongings;
  cible  uuid;
  source uuid;
  lieu   text;
begin
  select * into ligne from belonging_handoffs where id = handoff for update;
  if ligne.id is null then
    raise exception 'Remise introuvable' using errcode = 'P0002';
  end if;
  if ligne.state <> 'offered' then
    raise exception 'Cette remise est déjà tranchée' using errcode = '42501';
  end if;
  if ligne.to_user <> auth.uid() then
    raise exception 'Cette remise ne vous est pas adressée' using errcode = '42501';
  end if;
  if ligne.direction = 'offer' then
    cible := ligne.to_user; source := ligne.from_user;
  else
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
  if objet.place = 'salle' then
    raise exception 'Cet objet est resté en salle : on ne tend pas ce qu''on n''a pas.'
      using errcode = '42501';
  end if;

  lieu := app_lieu_de_remise(ligne);
  perform set_config('app.recuperation', 'on', true);
  if ligne.kind = 'give' then
    update belongings
       set owner_id = cible, former_owner = source, holder_id = null,
           state = 'owned', container_id = null, carried = false,
           place = lieu,
           place_session = case when lieu = 'bureau' then ligne.session_id end,
           place_class = case when lieu = 'bureau' then ligne.class_id end
     where id = objet.id;
  else
    update belongings
       set holder_id = cible, state = 'lent', container_id = null, carried = false,
           place = lieu,
           place_session = case when lieu = 'bureau' then ligne.session_id end,
           place_class = case when lieu = 'bureau' then ligne.class_id end
     where id = objet.id;
  end if;
  perform set_config('app.recuperation', 'off', true);

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

create or replace function return_belonging_handoff(handoff uuid)
returns belonging_handoffs
language plpgsql security definer set search_path = public as $$
declare ligne belonging_handoffs; objet belongings; lieu text;
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
  if objet.place = 'salle' then
    raise exception 'Cet objet est resté en salle : il faut d''abord aller le chercher.'
      using errcode = '42501';
  end if;
  lieu := app_lieu_de_remise(ligne);
  perform set_config('app.recuperation', 'on', true);
  update belongings
     set holder_id = null, state = 'owned', container_id = null, carried = false,
         place = lieu,
         place_session = case when lieu = 'bureau' then ligne.session_id end,
         place_class = case when lieu = 'bureau' then ligne.class_id end
   where id = ligne.belonging_id;
  perform set_config('app.recuperation', 'off', true);

  update belonging_handoffs set state = 'returned', settled_at = now()
   where id = handoff returning * into ligne;

  insert into notifications (user_id, class_id, kind, title, body, link)
  values (case when auth.uid() = objet.owner_id then ligne.to_user else objet.owner_id end,
          ligne.class_id, 'affaires', 'Prêt rendu',
          coalesce(nullif(objet.label, ''), objet.kind), '/affaires');

  return ligne;
end $$;
