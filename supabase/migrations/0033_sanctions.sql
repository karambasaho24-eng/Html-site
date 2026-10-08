-- 0033 — Les sanctions.
--
-- Cinq issues, de la plus douce à la plus dure :
--   · mort        — le personnage est mort, en jeu : on recommence, sans faute ;
--   · personnage  — le personnage est banni : on recommence, avec une raison ;
--   · temporaire  — le compte est suspendu jusqu'à une date ;
--   · definitif   — le compte est banni ;
--   · ip          — le compte est banni, et ses connexions internet aussi :
--                   ni connexion ni nouveau compte depuis ces adresses.
--
-- Qui : la modération prononce mort, personnage et temporaire ; définitif et
-- IP relèvent de l'administration. Un encadrant ne se sanctionne que par
-- l'administration, un super administrateur que par un super administrateur.
-- Jamais soi-même. Tout est inscrit au journal ; une sanction se lève.
--
-- Les adresses IP ne sont jamais gardées en clair : seulement une empreinte
-- salée, le sel vivant dans la base (pas dans le dépôt, qui est public).
-- Un bannissement IP se contourne (autre réseau, VPN) : il freine, il
-- n'empêche pas tout.

create table if not exists public.app_secrets (cle text primary key, valeur text not null);
alter table public.app_secrets enable row level security;
insert into public.app_secrets (cle, valeur)
values ('sel_ip', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (cle) do nothing;

create or replace function public.app_ip_hash() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  h json := nullif(current_setting('request.headers', true), '')::json;
  ip text;
begin
  if h is null then return null; end if;
  ip := btrim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', h->>'x-forwarded-for', ''), ',', 1));
  if ip = '' then return null; end if;
  return encode(extensions.digest((select valeur from app_secrets where cle = 'sel_ip') || ip, 'sha256'), 'hex');
end $$;

create table if not exists public.connexions_ip (
  user_id uuid not null,
  ip_hash text not null,
  vu_le   timestamptz not null default now(),
  primary key (user_id, ip_hash)
);
alter table public.connexions_ip enable row level security;

create table if not exists public.sanctions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  nom        text,
  genre      text not null check (genre in ('mort', 'personnage', 'temporaire', 'definitif', 'ip')),
  raison     text not null check (char_length(raison) between 1 and 600),
  jusqua     timestamptz,
  ip_hashes  text[] not null default '{}',
  par        uuid default auth.uid(),
  created_at timestamptz not null default now(),
  levee_at   timestamptz,
  levee_par  uuid
);
create index if not exists sanctions_user_idx on public.sanctions(user_id, created_at desc);
alter table public.sanctions enable row level security;
create policy sanctions_read on public.sanctions
  for select to authenticated using (user_id = auth.uid() or app_is_moderator());

/* La sanction de compte en vigueur (ou rien). */
create or replace function public.app_sanction_active(cible uuid, h text) returns sanctions
language sql stable security definer set search_path = public as $$
  select s.* from sanctions s
   where s.levee_at is null
     and ((s.user_id = cible and (s.genre in ('definitif', 'ip') or (s.genre = 'temporaire' and s.jusqua > now())))
          or (h is not null and s.genre = 'ip' and h = any(s.ip_hashes)))
   order by s.created_at desc
   limit 1;
$$;

/* À chaque ouverture du site : on note l'empreinte de la connexion, et l'on
   dit si l'accès est bloqué. Appelable sans être connecté (écran d'entrée). */
create or replace function public.mon_acces() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  h text := app_ip_hash();
  s sanctions;
begin
  if auth.uid() is not null and h is not null then
    insert into connexions_ip (user_id, ip_hash) values (auth.uid(), h)
    on conflict (user_id, ip_hash) do update set vu_le = now();
  end if;
  s := app_sanction_active(auth.uid(), h);
  if s.id is null then
    return jsonb_build_object('bloque', false, 'ip_vue', h is not null);
  end if;
  return jsonb_build_object('bloque', true, 'genre', s.genre, 'raison', s.raison,
    'jusqua', s.jusqua, 'ip_vue', h is not null);
end $$;

create or replace function public.sanctionner(cible uuid, genre text, raison text, jours integer default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  ips text[];
begin
  if not app_is_moderator() then
    raise exception 'Réservé à la modération.' using errcode = '42501';
  end if;
  if genre not in ('mort', 'personnage', 'temporaire', 'definitif', 'ip') then
    raise exception 'Sanction inconnue.' using errcode = '22023';
  end if;
  if genre in ('definitif', 'ip') and not app_peut_nommer() then
    raise exception 'Un bannissement définitif ou IP relève de l''administration.' using errcode = '42501';
  end if;
  if cible = auth.uid() then
    raise exception 'On ne se sanctionne pas soi-même.' using errcode = '42501';
  end if;
  if coalesce(btrim(raison), '') = '' or char_length(raison) > 600 then
    raise exception 'Donnez une raison (600 caractères au plus).' using errcode = '22023';
  end if;
  if genre = 'temporaire' and (jours is null or jours < 1 or jours > 365) then
    raise exception 'Une durée de 1 à 365 jours.' using errcode = '22023';
  end if;
  select * into p from profiles where id = cible;
  if not found then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
  if p.role_key in ('moderator', 'admin', 'director') and not app_peut_nommer() then
    raise exception 'Seule l''administration sanctionne un membre de l''encadrement.' using errcode = '42501';
  end if;
  if p.role_key = 'super_admin' and not app_is_super_admin() then
    raise exception 'Seul un super administrateur sanctionne un super administrateur.' using errcode = '42501';
  end if;

  if genre = 'ip' then
    select coalesce(array_agg(ip_hash), '{}') into ips from connexions_ip where user_id = cible;
  end if;
  insert into sanctions (user_id, nom, genre, raison, jusqua, ip_hashes)
  values (cible, p.display_name, genre, btrim(raison),
          case when genre = 'temporaire' then now() + make_interval(days => jours) end,
          coalesce(ips, '{}'));

  -- Le personnage tombe : mort, banni, ou compte banni pour de bon.
  if genre in ('mort', 'personnage', 'definitif', 'ip') then
    perform set_config('app.bannissement', cible::text, true);
    update profiles
       set titre = null, titre_libelle = null,
           preferences = coalesce(preferences, '{}'::jsonb) - 'avatar'
                         || jsonb_build_object('bannissement', jsonb_build_object(
                              'genre', genre, 'raison', btrim(raison), 'le', now(), 'lu', false))
     where id = cible;
    perform set_config('app.bannissement', '', true);
  end if;

  insert into notifications (user_id, kind, title, body)
  values (cible, 'bannissement',
    case genre when 'mort' then 'Votre personnage est mort'
               when 'personnage' then 'Votre personnage a été banni'
               when 'temporaire' then 'Votre compte est suspendu'
               else 'Votre compte est banni' end,
    btrim(raison));
  perform app_journaliser(auth.uid(), 'sanction.' || genre,
    jsonb_build_object('cible', p.id, 'nom', p.display_name, 'raison', btrim(raison), 'jours', jours,
                       'ips', coalesce(array_length(ips, 1), 0)));
  return p.display_name;
end $$;

create or replace function public.lever_sanction(sanction uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s sanctions;
begin
  select * into s from sanctions where id = sanction;
  if not found then raise exception 'Sanction introuvable.' using errcode = 'P0002'; end if;
  if not app_is_moderator() or (s.genre in ('definitif', 'ip') and not app_peut_nommer()) then
    raise exception 'Vous ne pouvez pas lever cette sanction.' using errcode = '42501';
  end if;
  update sanctions set levee_at = now(), levee_par = auth.uid() where id = sanction and levee_at is null;
  perform app_journaliser(auth.uid(), 'sanction.levee',
    jsonb_build_object('cible', s.user_id, 'nom', s.nom, 'genre', s.genre));
end $$;

-- L'ancien bannissement de personnage passe par les sanctions.
create or replace function public.bannir_personnage(cible uuid, raison text)
returns text language sql security definer set search_path = public as $$
  select sanctionner(cible, 'personnage', raison, null);
$$;

-- Se connecter, s'inscrire : refusé à un compte banni ou depuis une connexion bannie.
create or replace function public.courriel_du_pseudo(pseudo text)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare
  adresse text := 'j' || left(encode(extensions.digest(convert_to(
           lower(regexp_replace(btrim(coalesce(pseudo, '')), '\s+', ' ', 'g')), 'UTF8'), 'sha256'), 'hex'), 40)
         || '@joueurs.classe-parallele.fr';
  compte uuid;
  s sanctions;
begin
  select id into compte from auth.users where email = adresse;
  s := app_sanction_active(compte, app_ip_hash());
  if s.id is not null then
    raise exception '%', case
      when s.genre = 'temporaire' then 'Compte suspendu jusqu''au ' || to_char(s.jusqua at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI') || '. Raison : ' || s.raison
      when s.genre = 'ip' then 'Accès bloqué depuis cette connexion. Raison : ' || s.raison
      else 'Compte banni définitivement. Raison : ' || s.raison end
      using errcode = '42501';
  end if;
  return adresse;
end $$;

revoke execute on function public.app_ip_hash(), public.app_sanction_active(uuid, text) from public, anon, authenticated;
revoke execute on function public.sanctionner(uuid, text, text, integer), public.lever_sanction(uuid) from public, anon;
grant execute on function public.sanctionner(uuid, text, text, integer), public.lever_sanction(uuid) to authenticated;
grant execute on function public.mon_acces(), public.courriel_du_pseudo(text) to anon, authenticated;
