-- 0029 — La modération, les titres, et des remises qui se vérifient.
--
-- Trois choses, qui tiennent ensemble :
--
-- 1. QUI NOMME QUI. Seul un administrateur (admin, super_admin) change un
--    rôle ou un titre. Seul un super administrateur fait ou défait un super
--    administrateur. Personne ne change son propre rôle : on ne se
--    destitue pas par mégarde, et on ne se promeut pas.
--
-- 2. LES TITRES. Un titre de personnage — roi, reine, commandant… — est
--    attribué par l'administration. Il ne donne aucun droit sur la
--    plateforme : il change la mise en scène (le trône, la couronne) et la
--    façon dont on vous nomme.
--
-- 3. LA REMISE VÉRIFIÉE. Celui qui tend un papier dit où il est et, s'il le
--    veut, décrit la scène. Celui qui le reçoit doit répondre : « cette
--    personne est-elle bien devant moi, en jeu ? ». Il dit où il est. Tout
--    est inscrit au journal, et la modération relit : une remise sans
--    description, une présence niée ou deux lieux qui ne concordent pas
--    remontent d'eux-mêmes dans sa liste — sans notification, on n'alerte
--    personne pour un oubli.

-- ---------------------------------------------------------------------------
-- 1. Qui nomme qui
-- ---------------------------------------------------------------------------
create or replace function public.app_peut_nommer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role_key in ('admin', 'super_admin')
  );
$$;

create or replace function public.app_is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role_key = 'super_admin');
$$;

alter table public.profiles add column if not exists titre text;
alter table public.profiles add column if not exists titre_libelle text;
do $$ begin
  alter table public.profiles add constraint profiles_titre_forme
    check (titre is null or titre ~ '^[a-z_]{1,30}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_titre_libelle_long
    check (titre_libelle is null or char_length(titre_libelle) <= 60);
exception when duplicate_object then null; end $$;

create or replace function public.app_garde_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Le serveur lui-même (inscription, console SQL) passe.
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not app_peut_nommer() then
      new.role_key := 'student';
      new.titre := null;
      new.titre_libelle := null;
    end if;
    return new;
  end if;

  if new.role_key is distinct from old.role_key then
    if not app_peut_nommer() then
      raise exception 'Seule l''administration change un rôle.' using errcode = '42501';
    end if;
    if old.id = auth.uid() then
      raise exception 'On ne change pas son propre rôle.' using errcode = '42501';
    end if;
    if (new.role_key = 'super_admin' or old.role_key = 'super_admin') and not app_is_super_admin() then
      raise exception 'Seul un super administrateur fait ou défait un super administrateur.' using errcode = '42501';
    end if;
  end if;

  if (new.titre is distinct from old.titre or new.titre_libelle is distinct from old.titre_libelle)
     and not app_peut_nommer() then
    raise exception 'Un titre est attribué par l''administration.' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Le journal : ce qui s'inscrit tout seul
-- ---------------------------------------------------------------------------
create or replace function public.app_journaliser(
  qui uuid, quoi text, details jsonb, classe uuid default null, seance uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into activity_logs (class_id, session_id, user_id, action, meta)
  values (
    case when classe is not null and exists (select 1 from classes where id = classe) then classe end,
    case when seance is not null and exists (select 1 from class_sessions where id = seance) then seance end,
    qui, quoi, coalesce(details, '{}'::jsonb)
  );
end $$;
revoke execute on function public.app_journaliser(uuid, text, jsonb, uuid, uuid) from public, anon, authenticated;

-- Les rôles et les titres changés.
create or replace function public.app_journal_profil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role_key is distinct from old.role_key then
    perform app_journaliser(coalesce(auth.uid(), new.id), 'compte.role',
      jsonb_build_object('cible', new.id, 'nom', new.display_name, 'avant', old.role_key, 'apres', new.role_key));
  end if;
  if new.titre is distinct from old.titre or new.titre_libelle is distinct from old.titre_libelle then
    perform app_journaliser(coalesce(auth.uid(), new.id), 'compte.titre',
      jsonb_build_object('cible', new.id, 'nom', new.display_name,
        'avant', old.titre, 'apres', new.titre, 'libelle', new.titre_libelle));
  end if;
  return new;
end $$;

create or replace trigger profiles_journal
  after update on public.profiles
  for each row execute function public.app_journal_profil();

-- La modération lit tout le journal ; chacun garde le sien.
alter policy logs_read on public.activity_logs
  using (
    user_id = auth.uid()
    or (class_id is not null and app_is_staff(class_id))
    or app_is_moderator()
  );

-- ---------------------------------------------------------------------------
-- 3. La remise vérifiée
-- ---------------------------------------------------------------------------
alter table public.paper_handoffs add column if not exists lieu text;
alter table public.paper_handoffs add column if not exists description text;
alter table public.paper_handoffs add column if not exists lieu_reception text;
alter table public.paper_handoffs add column if not exists presence boolean;
alter table public.paper_handoffs add column if not exists presence_at timestamptz;
do $$ begin
  alter table public.paper_handoffs add constraint paper_handoffs_textes_courts check (
    (lieu is null or char_length(lieu) <= 120)
    and (lieu_reception is null or char_length(lieu_reception) <= 120)
    and (description is null or char_length(description) <= 600)
  );
exception when duplicate_object then null; end $$;

/*
 * Ce que chacun peut changer à une remise, une fois tendue.
 *   · l'émetteur : la retirer, tant qu'elle attend ;
 *   · le destinataire : dire si l'émetteur est devant lui, dire où il est,
 *     garder ou refuser — et l'on ne garde pas un papier qu'on dit avoir
 *     reçu de quelqu'un d'absent ;
 *   · personne : réécrire qui, quoi, où et quand l'émetteur l'a tendu.
 */
create or replace function public.app_garde_remise_papier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.paper_id <> old.paper_id or new.from_user <> old.from_user or new.to_user <> old.to_user
     or new.lieu is distinct from old.lieu or new.description is distinct from old.description
     or new.attested is distinct from old.attested or new.created_at <> old.created_at
     or new.class_id is distinct from old.class_id or new.session_id is distinct from old.session_id then
    raise exception 'Une remise ne se réécrit pas.' using errcode = '42501';
  end if;

  if auth.uid() = old.to_user then
    if old.presence is not null and new.presence is distinct from old.presence then
      raise exception 'Vous avez déjà répondu pour la présence.' using errcode = '42501';
    end if;
    if new.presence is distinct from old.presence then
      new.presence_at := now();
    end if;
    if new.state = 'withdrawn' and old.state <> 'withdrawn' then
      raise exception 'Seul l''émetteur retire une remise.' using errcode = '42501';
    end if;
    if old.state in ('refused', 'withdrawn') and new.state <> old.state then
      raise exception 'Cette remise est close.' using errcode = '42501';
    end if;
    if new.state = 'accepted' and old.state <> 'accepted' and new.presence is not true then
      raise exception 'Confirmez d''abord que la personne est devant vous, en jeu.' using errcode = '42501';
    end if;
    if new.presence is false and new.state = 'accepted' then
      raise exception 'On ne garde pas un papier tendu par quelqu''un d''absent.' using errcode = '42501';
    end if;
  elsif auth.uid() = old.from_user then
    if new.presence is distinct from old.presence or new.lieu_reception is distinct from old.lieu_reception
       or new.presence_at is distinct from old.presence_at then
      raise exception 'C''est au destinataire de répondre.' using errcode = '42501';
    end if;
    if new.state is distinct from old.state and not (old.state = 'offered' and new.state = 'withdrawn') then
      raise exception 'Vous ne pouvez que retirer une remise en attente.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create or replace trigger paper_handoffs_garde
  before update on public.paper_handoffs
  for each row execute function public.app_garde_remise_papier();

create or replace function public.app_journal_remise_papier()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  titre text;
  base jsonb;
begin
  select p.title into titre from papers p where p.id = new.paper_id;
  base := jsonb_build_object('remise', new.id, 'papier', new.paper_id, 'titre', titre,
    'de', new.from_user, 'a', new.to_user, 'lieu', new.lieu, 'lieu_reception', new.lieu_reception);
  if tg_op = 'INSERT' then
    perform app_journaliser(new.from_user, 'papier.tendu',
      base || jsonb_build_object('description', new.description,
        'sans_description', coalesce(btrim(new.description), '') = ''),
      new.class_id, new.session_id);
    return new;
  end if;
  if new.presence is distinct from old.presence then
    perform app_journaliser(new.to_user,
      case when new.presence then 'papier.presence_confirmee' else 'papier.presence_niee' end,
      base, new.class_id, new.session_id);
  end if;
  if new.state is distinct from old.state then
    perform app_journaliser(
      case when new.state = 'withdrawn' then new.from_user else new.to_user end,
      'papier.' || new.state::text, base, new.class_id, new.session_id);
  end if;
  return new;
end $$;

create or replace trigger paper_handoffs_journal
  after insert or update on public.paper_handoffs
  for each row execute function public.app_journal_remise_papier();

-- Les objets et les cahiers qui passent de main en main s'inscrivent aussi.
create or replace function public.app_journal_remise_objet()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  genre text := case tg_table_name when 'notebook_handoffs' then 'cahier' else 'objet' end;
  base jsonb := jsonb_build_object('remise', new.id, 'de', new.from_user, 'a', new.to_user,
    'mode', to_jsonb(new)->>'kind');
begin
  if tg_op = 'INSERT' then
    perform app_journaliser(new.from_user, genre || '.tendu', base, new.class_id, new.session_id);
  elsif new.state is distinct from old.state then
    perform app_journaliser(coalesce(auth.uid(), new.to_user), genre || '.' || new.state::text,
      base, new.class_id, new.session_id);
  end if;
  return new;
end $$;

create or replace trigger belonging_handoffs_journal
  after insert or update on public.belonging_handoffs
  for each row execute function public.app_journal_remise_objet();
create or replace trigger notebook_handoffs_journal
  after insert or update on public.notebook_handoffs
  for each row execute function public.app_journal_remise_objet();

-- La modération lit les papiers qui ont circulé, et toutes les fiches.
alter policy papers_read on public.papers
  using (
    author_id = auth.uid()
    or exists (select 1 from paper_handoffs h where h.paper_id = papers.id and h.to_user = auth.uid())
    or (class_id is not null and app_is_staff(class_id))
    or exists (select 1 from dossier_items d where d.paper_id = papers.id and app_tient_le_dossier(d.dossier_id))
    or app_is_moderator()
  );

alter policy rp_profiles_read on public.rp_profiles
  using (app_is_member(class_id) or app_is_moderator());

alter policy rp_profiles_delete on public.rp_profiles
  using (user_id = auth.uid() or app_is_staff(class_id) or app_is_moderator());

-- ---------------------------------------------------------------------------
-- 4. Les notes de la modération
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_notes (
  id          uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in
                ('paper_handoff', 'belonging_handoff', 'notebook_handoff', 'profile', 'log')),
  target_id   uuid not null,
  author_id   uuid not null default auth.uid() references profiles(id) on delete cascade,
  verdict     text not null default 'note' check (verdict in ('fiable', 'douteux', 'faux', 'a_verifier', 'note')),
  body        text check (body is null or char_length(body) <= 1000),
  created_at  timestamptz not null default now()
);
create index if not exists moderation_notes_cible_idx on public.moderation_notes(target_kind, target_id, created_at desc);
alter table public.moderation_notes enable row level security;

create policy moderation_notes_read on public.moderation_notes
  for select to authenticated using (app_is_moderator());
create policy moderation_notes_write on public.moderation_notes
  for insert to authenticated with check (app_is_moderator() and author_id = auth.uid());
create policy moderation_notes_delete on public.moderation_notes
  for delete to authenticated using (author_id = auth.uid() or app_peut_nommer());

create or replace function public.app_journal_note_moderation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app_journaliser(new.author_id, 'moderation.note',
    jsonb_build_object('cible', new.target_id, 'genre', new.target_kind, 'verdict', new.verdict));
  return new;
end $$;
create or replace trigger moderation_notes_journal
  after insert on public.moderation_notes
  for each row execute function public.app_journal_note_moderation();

-- ---------------------------------------------------------------------------
-- 5. Ce que la modération fait : annoncer, écrire, retirer
-- ---------------------------------------------------------------------------
create or replace function public.annoncer_a_tous(titre text, corps text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not app_is_moderator() then
    raise exception 'Réservé à la modération.' using errcode = '42501';
  end if;
  if coalesce(btrim(titre), '') = '' or char_length(titre) > 120 or char_length(coalesce(corps, '')) > 2000 then
    raise exception 'Titre requis (120 caractères au plus), texte de 2000 caractères au plus.' using errcode = '22023';
  end if;
  insert into notifications (user_id, kind, title, body)
  select id, 'annonce', btrim(titre), nullif(btrim(corps), '') from profiles;
  get diagnostics n = row_count;
  perform app_journaliser(auth.uid(), 'moderation.annonce',
    jsonb_build_object('titre', btrim(titre), 'destinataires', n));
  return n;
end $$;

create or replace function public.message_de_moderation(cible uuid, titre text, corps text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app_is_moderator() then
    raise exception 'Réservé à la modération.' using errcode = '42501';
  end if;
  if coalesce(btrim(titre), '') = '' or char_length(titre) > 120 or char_length(coalesce(corps, '')) > 2000 then
    raise exception 'Titre requis (120 caractères au plus), texte de 2000 caractères au plus.' using errcode = '22023';
  end if;
  insert into notifications (user_id, kind, title, body) values (cible, 'moderation', btrim(titre), nullif(btrim(corps), ''));
  perform app_journaliser(auth.uid(), 'moderation.message',
    jsonb_build_object('cible', cible, 'titre', btrim(titre)));
end $$;

-- Retirer un papier : la modération peut le supprimer ; le retrait est
-- inscrit au journal par un déclencheur, quel que soit le chemin emprunté.
create policy papers_moderation_retire on public.papers
  for delete to authenticated using (app_is_moderator());

create or replace function public.app_journal_papier_retire()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> old.author_id then
    perform app_journaliser(auth.uid(), 'moderation.papier_retire',
      jsonb_build_object('papier', old.id, 'titre', old.title, 'auteur', old.author_id));
  end if;
  return old;
end $$;
create or replace trigger papers_journal_retrait
  before delete on public.papers
  for each row execute function public.app_journal_papier_retire();

revoke execute on function public.annoncer_a_tous(text, text) from public, anon;
revoke execute on function public.message_de_moderation(uuid, text, text) from public, anon;
grant execute on function public.annoncer_a_tous(text, text) to authenticated;
grant execute on function public.message_de_moderation(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. L'audience : une séance au palais
-- ---------------------------------------------------------------------------
alter type session_mode add value if not exists 'audience';

-- ---------------------------------------------------------------------------
-- 7. Les fonctions internes ne s'appellent pas depuis l'API
-- ---------------------------------------------------------------------------
revoke execute on function public.app_garde_remise_papier(), public.app_journal_note_moderation(),
  public.app_journal_papier_retire(), public.app_journal_profil(), public.app_journal_remise_objet(),
  public.app_journal_remise_papier() from public, anon, authenticated;
revoke execute on function public.app_is_super_admin(), public.app_peut_nommer() from public, anon;
grant execute on function public.app_is_super_admin(), public.app_peut_nommer() to authenticated;
