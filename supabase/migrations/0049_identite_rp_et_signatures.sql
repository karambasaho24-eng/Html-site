-- ============================================================================
-- 0049 — L'identité RP d'abord, et des signatures libres.
--
-- Rien n'est supprimé, aucune ligne existante n'est modifiée.
--
--   1. Chacun peut changer SON nom RP quand il le veut, sans demande à
--      l'administration (le personnage meurt, change de nom…). Le compte, les
--      cahiers, les achats et les droits restent : seul le nom affiché change.
--      Garde-fous : pas pendant une sanction active, pas le nom d'un autre, pas
--      le nom d'un personnage déclaré mort.
--   2. Les signatures apposées sur un papier (paper_signatures) : qui (compte),
--      sous quel nom RP AU MOMENT de signer, quoi (texte ou tracé), quand. Une
--      signature ne se modifie ni ne s'efface : changer de nom ne réécrit pas
--      l'histoire. Un papier signé ne se réécrit plus.
--   3. On vous tend un cahier ou un papier : une notification arrive.
-- ============================================================================

-- 1. Le nom RP, choisi et changé par la personne elle-même ------------------
create or replace function public.choisir_mon_nom_rp(nom text) returns text
language plpgsql security definer set search_path = public as $$
declare
  p      profiles;
  propre text := nullif(btrim(regexp_replace(coalesce(nom, ''), '\s+', ' ', 'g')), '');
  neuf   text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into p from profiles where id = auth.uid();
  if not found then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
  if (app_sanction_active(auth.uid(), null::text)).id is not null then
    raise exception 'Un compte sanctionné ne change pas de nom.' using errcode = '42501';
  end if;
  if propre is null or char_length(propre) < 2 or char_length(propre) > 60 then
    raise exception 'Le nom RP doit faire entre 2 et 60 caractères.' using errcode = '22023';
  end if;
  if exists (
    select 1 from profiles o
     where o.id <> p.id
       and (lower(o.display_name) = lower(propre) or lower(coalesce(o.discord_name, '')) = lower(propre))
  ) then
    raise exception 'Ce nom est déjà porté par quelqu''un d''autre.' using errcode = '23505';
  end if;
  -- La mort est définitive : un personnage déclaré mort ne revient pas sous son nom.
  if exists (
    select 1 from activity_logs l
     where l.action = 'compte.personnage_mort' and lower(l.meta->>'nom') = lower(propre)
  ) then
    raise exception 'Ce personnage est mort : son nom ne peut plus être porté.' using errcode = '42501';
  end if;
  perform set_config('app.nom_rp_rpc', '1', true);
  update profiles
     set display_name = propre,
         discord_name = coalesce(discord_name, display_name),
         nom_rp_libre = false
   where id = p.id returning display_name into neuf;
  perform app_journaliser(auth.uid(), 'compte.nom_rp_choisi',
    jsonb_build_object('cible', p.id, 'avant', p.display_name, 'apres', neuf,
                       'discord', coalesce(p.discord_name, p.display_name)));
  return neuf;
end $$;

-- 2. Les signatures ----------------------------------------------------------
create table if not exists public.paper_signatures (
  id         uuid primary key default gen_random_uuid(),
  paper_id   uuid not null references public.papers(id) on delete cascade,
  signer_id  uuid references public.profiles(id) on delete set null,   -- le nom RP reste si le compte part
  nom_rp     text not null,                       -- figé au moment de signer
  kind       text not null check (kind in ('texte', 'trace')),
  -- texte : { "texte": "...", "police": "..." } ; tracé : { "traits": [[x,y,x,y,...], ...] }
  -- (des nombres seulement : jamais de SVG ni de HTML venus du navigateur)
  data       jsonb not null check (octet_length(data::text) <= 24000),
  created_at timestamptz not null default now()
);
create index if not exists paper_signatures_paper on public.paper_signatures (paper_id, created_at);
alter table public.paper_signatures enable row level security;
grant select, insert on public.paper_signatures to authenticated;

-- Le nom RP et l'auteur viennent du compte connecté, jamais du navigateur.
create or replace function public.app_signature_attribuee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.signer_id := auth.uid();
  new.nom_rp := (select display_name from profiles where id = auth.uid());
  new.created_at := now();
  return new;
end $$;
drop trigger if exists paper_signatures_attribution on public.paper_signatures;
create trigger paper_signatures_attribution before insert on public.paper_signatures
  for each row execute function public.app_signature_attribuee();

drop policy if exists signatures_lire on public.paper_signatures;
create policy signatures_lire on public.paper_signatures for select to authenticated
  using (exists (select 1 from papers p where p.id = paper_id));      -- même lecture que le papier
drop policy if exists signatures_signer on public.paper_signatures;
create policy signatures_signer on public.paper_signatures for insert to authenticated
  with check (exists (select 1 from papers p where p.id = paper_id and p.holder_id = auth.uid())
              and not exists (select 1 from paper_handoffs h where h.paper_id = paper_signatures.paper_id and h.state = 'offered'));
-- Aucune règle update/delete : une signature apposée ne bouge plus.

-- Un papier signé ne se réécrit plus (titre et texte).
create or replace function public.app_papier_signe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.body is distinct from old.body or new.title is distinct from old.title)
     and exists (select 1 from paper_signatures s where s.paper_id = old.id) then
    raise exception 'Ce papier est signé : son texte ne change plus.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists papers_signe on public.papers;
create trigger papers_signe before update on public.papers
  for each row execute function public.app_papier_signe();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'paper_signatures') then
    execute 'alter publication supabase_realtime add table public.paper_signatures';
  end if;
end $$;

-- 3. On vous tend quelque chose : une notification -------------------------
create or replace function public.app_notifier_remise() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  de    text := (select display_name from profiles where id = new.from_user);
  quoi  text := case when tg_table_name = 'notebook_handoffs' then 'un cahier' else 'un papier' end;
  -- to_jsonb : les deux tables n'ont pas les mêmes colonnes (note / description).
  titre text := coalesce(to_jsonb(new)->>'note', to_jsonb(new)->>'description', quoi);
begin
  if new.state = 'offered' then
    insert into notifications (user_id, kind, title, body, link)
    values (new.to_user, 'remise', coalesce(de, 'Quelqu''un') || ' vous tend ' || quoi,
            '« ' || left(titre, 80) || ' » — acceptez ou refusez.', '#/manette');
  end if;
  return new;
end $$;
drop trigger if exists notebook_handoffs_notifier on public.notebook_handoffs;
create trigger notebook_handoffs_notifier after insert on public.notebook_handoffs
  for each row execute function public.app_notifier_remise();
drop trigger if exists paper_handoffs_notifier on public.paper_handoffs;
create trigger paper_handoffs_notifier after insert on public.paper_handoffs
  for each row execute function public.app_notifier_remise();
