-- Blocus Assault — schéma complet de la base (Supabase / Postgres)
--
-- À exécuter UNE fois dans le projet Supabase dédié à Blocus Assault.
-- Ce script ne crée que des objets préfixés « ba_ » et ne modifie, ne vide
-- ni ne supprime aucun objet existant : il peut donc cohabiter sans risque
-- avec ce qui se trouve déjà dans la base.

create extension if not exists pgcrypto with schema extensions;

-- Tables -------------------------------------------------------------------
create table if not exists public.ba_users (
  id uuid primary key default gen_random_uuid(),
  pseudo text unique not null check (pseudo ~ '^[A-Za-z0-9_.-]{3,20}$'),
  pass_hash text not null,
  created_at timestamptz default now()
);
create table if not exists public.ba_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid references public.ba_users(id) on delete cascade,
  created_at timestamptz default now()
);
create table if not exists public.ba_reports (
  id bigint generated always as identity primary key,
  school_id text not null,
  school_name text not null,
  city text,
  lat double precision not null,
  lng double precision not null,
  gate_label text,
  kind text not null,
  severity int not null default 1 check (severity between 0 and 3),
  message text check (char_length(message) <= 500),
  author text,
  confirms int not null default 0,
  denies int not null default 0,
  created_at timestamptz default now()
);
create index if not exists ba_reports_school on public.ba_reports(school_id, created_at desc);
create index if not exists ba_reports_time on public.ba_reports(created_at desc);
create table if not exists public.ba_chat (
  id bigint generated always as identity primary key,
  room text not null,
  author text,
  message text not null check (char_length(message) between 1 and 300),
  created_at timestamptz default now()
);
create index if not exists ba_chat_room on public.ba_chat(room, created_at desc);
create table if not exists public.ba_checkpoints (
  id bigint generated always as identity primary key,
  school_id text not null,
  school_name text not null,
  name text not null check (char_length(name) between 2 and 80),
  kind text not null,
  lat double precision not null,
  lng double precision not null,
  author text,
  created_at timestamptz default now()
);
create index if not exists ba_checkpoints_school on public.ba_checkpoints(school_id);

-- Sécurité : lecture publique, écriture uniquement via les fonctions ba_* ----
alter table public.ba_users enable row level security;
alter table public.ba_sessions enable row level security;
alter table public.ba_reports enable row level security;
alter table public.ba_chat enable row level security;
alter table public.ba_checkpoints enable row level security;
create policy ba_reports_read on public.ba_reports for select using (true);
create policy ba_chat_read on public.ba_chat for select using (true);
create policy ba_checkpoints_read on public.ba_checkpoints for select using (true);
grant select on public.ba_reports, public.ba_chat, public.ba_checkpoints to anon, authenticated;

-- Temps réel ------------------------------------------------------------------
alter table public.ba_reports replica identity full;
alter publication supabase_realtime add table public.ba_reports, public.ba_chat, public.ba_checkpoints;

-- Fonctions -------------------------------------------------------------------
create or replace function public.ba_pseudo_from(p_token uuid) returns text
language sql security definer set search_path = public stable as $$
  select u.pseudo from ba_sessions s join ba_users u on u.id = s.user_id where s.token = p_token
$$;

create or replace function public.ba_register(p_pseudo text, p_pass text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; tok uuid;
begin
  if p_pseudo !~ '^[A-Za-z0-9_.-]{3,20}$' then raise exception 'Pseudo invalide (3-20 caractères : lettres, chiffres, . _ -)'; end if;
  if char_length(p_pass) < 6 then raise exception 'Mot de passe trop court (6 caractères minimum)'; end if;
  if exists (select 1 from ba_users where lower(pseudo) = lower(p_pseudo)) then raise exception 'Pseudo déjà pris'; end if;
  insert into ba_users(pseudo, pass_hash) values (p_pseudo, crypt(p_pass, gen_salt('bf'))) returning id into uid;
  insert into ba_sessions(user_id) values (uid) returning token into tok;
  return json_build_object('token', tok, 'pseudo', p_pseudo);
end $$;

create or replace function public.ba_login(p_pseudo text, p_pass text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare u ba_users; tok uuid;
begin
  select * into u from ba_users where lower(pseudo) = lower(p_pseudo);
  if u.id is null or u.pass_hash <> crypt(p_pass, u.pass_hash) then raise exception 'Pseudo ou mot de passe incorrect'; end if;
  insert into ba_sessions(user_id) values (u.id) returning token into tok;
  return json_build_object('token', tok, 'pseudo', u.pseudo);
end $$;

create or replace function public.ba_post_report(p_token uuid, p_school_id text, p_school_name text, p_city text,
  p_lat double precision, p_lng double precision, p_gate text, p_kind text, p_severity int, p_message text)
returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  if p_kind not in ('blocus','partiel','debloque','calme','police','lacrymo','incendie','portail','intrusion','bouchon','manif','annule','transport','danger','aide','medical','info') then
    raise exception 'Type inconnu'; end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'Position invalide'; end if;
  if (select count(*) from ba_reports where created_at > now() - interval '1 minute') > 200 then raise exception 'Trop de signalements, réessayez dans un instant'; end if;
  insert into ba_reports(school_id, school_name, city, lat, lng, gate_label, kind, severity, message, author)
  values (left(p_school_id,80), left(p_school_name,150), left(p_city,80), p_lat, p_lng, left(p_gate,80), p_kind,
          greatest(0, least(3, coalesce(p_severity,1))), left(p_message,500), coalesce(ba_pseudo_from(p_token), 'Anonyme'))
  returning id into rid;
  return rid;
end $$;

create or replace function public.ba_vote(p_id bigint, p_confirm boolean) returns void
language sql security definer set search_path = public as $$
  update ba_reports set confirms = confirms + (case when p_confirm then 1 else 0 end),
                        denies = denies + (case when p_confirm then 0 else 1 end) where id = p_id
$$;

create or replace function public.ba_post_chat(p_token uuid, p_room text, p_message text, p_guest text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(coalesce(p_message,''))) = 0 then return; end if;
  insert into ba_chat(room, author, message)
  values (left(p_room,80), coalesce(ba_pseudo_from(p_token), 'Invité-' || left(coalesce(p_guest,'?'),12)), left(trim(p_message),300));
end $$;

create or replace function public.ba_add_checkpoint(p_token uuid, p_school_id text, p_school_name text,
  p_name text, p_kind text, p_lat double precision, p_lng double precision)
returns bigint language plpgsql security definer set search_path = public as $$
declare cid bigint; nm text := trim(coalesce(p_name, ''));
begin
  if p_kind not in ('portail','entree','carrefour','arret','rondpoint','parking','rassemblement','autre') then raise exception 'Type de checkpoint inconnu'; end if;
  if char_length(nm) < 2 then raise exception 'Donne un nom au checkpoint'; end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'Position invalide'; end if;
  if (select count(*) from ba_checkpoints where created_at > now() - interval '1 minute') > 60 then raise exception 'Trop de checkpoints créés, réessaie dans un instant'; end if;
  if exists (select 1 from ba_checkpoints where school_id = p_school_id and lower(name) = lower(nm)) then raise exception 'Un checkpoint porte déjà ce nom ici'; end if;
  insert into ba_checkpoints(school_id, school_name, name, kind, lat, lng, author)
  values (left(p_school_id,80), left(p_school_name,150), left(nm,80), p_kind, p_lat, p_lng, coalesce(ba_pseudo_from(p_token), 'Anonyme'))
  returning id into cid;
  return cid;
end $$;

create or replace view public.ba_ranking with (security_invoker = true) as
  select school_id, max(school_name) school_name, max(city) city, avg(lat) lat, avg(lng) lng,
    count(*) total,
    count(*) filter (where kind in ('blocus','partiel')) blocus,
    count(*) filter (where kind in ('incendie','intrusion','portail','lacrymo','danger')) incidents,
    max(created_at) last_at
  from public.ba_reports where created_at > now() - interval '30 days'
  group by school_id;

revoke execute on function public.ba_pseudo_from(uuid) from public, anon, authenticated;
grant execute on function public.ba_register(text,text), public.ba_login(text,text),
  public.ba_post_report(uuid,text,text,text,double precision,double precision,text,text,int,text),
  public.ba_vote(bigint,boolean), public.ba_post_chat(uuid,text,text,text),
  public.ba_add_checkpoint(uuid,text,text,text,text,double precision,double precision) to anon, authenticated;
grant select on public.ba_ranking to anon, authenticated;
