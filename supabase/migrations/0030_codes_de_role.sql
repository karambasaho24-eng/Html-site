-- 0030 — Les codes de rôle.
--
-- La barre de commandes permet de devenir modérateur ou administrateur en
-- tapant un code. Le dépôt est public : aucun code n'est écrit nulle part.
-- Un administrateur en génère un (« /code moderateur »), le donne en main
-- propre ; la personne le tape (« /role XXXX-XXXX-XXXX »). Le code ne sert
-- qu'une fois, expire au bout de 24 heures, et n'est conservé qu'en empreinte.
--
-- Qui donne quoi : un administrateur donne « modérateur » ou
-- « administrateur » ; seul un super administrateur donne « super
-- administrateur ». Un code ne fait jamais descendre quelqu'un.

create table if not exists public.role_codes (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null unique,
  role_key    text not null check (role_key in ('moderator', 'admin', 'super_admin')),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours',
  used_by     uuid,
  used_at     timestamptz
);
-- Aucune politique : on n'y touche que par les deux fonctions ci-dessous.
alter table public.role_codes enable row level security;

-- Le garde des rôles laisse passer un code valide, et lui seul.
create or replace function public.app_garde_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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

  if new.role_key is distinct from old.role_key
     and coalesce(current_setting('app.code_de_role', true), '') <> old.id::text then
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

create or replace function public.creer_code_role(role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  brut text;
  code text;
begin
  if role not in ('moderator', 'admin', 'super_admin') then
    raise exception 'Rôle inconnu : moderator, admin ou super_admin.' using errcode = '22023';
  end if;
  if not app_peut_nommer() then
    raise exception 'Seule l''administration crée un code.' using errcode = '42501';
  end if;
  if role = 'super_admin' and not app_is_super_admin() then
    raise exception 'Seul un super administrateur crée un code de super administrateur.' using errcode = '42501';
  end if;
  brut := upper(encode(extensions.gen_random_bytes(6), 'hex'));
  code := substr(brut, 1, 4) || '-' || substr(brut, 5, 4) || '-' || substr(brut, 9, 4);
  insert into role_codes (code_hash, role_key) values (encode(extensions.digest(code, 'sha256'), 'hex'), role);
  perform app_journaliser(auth.uid(), 'compte.code_cree', jsonb_build_object('role', role));
  return code;
end $$;

create or replace function public.utiliser_code_role(code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  ligne role_codes;
  actuel text;
  rang_actuel int;
  rang_code int;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous d''abord.' using errcode = '42501';
  end if;
  select * into ligne from role_codes
   where code_hash = encode(extensions.digest(upper(btrim(code)), 'sha256'), 'hex')
     and used_at is null and expires_at > now()
   for update;
  if not found then
    perform app_journaliser(auth.uid(), 'compte.code_refuse', '{}'::jsonb);
    raise exception 'Code invalide, déjà utilisé ou expiré.' using errcode = '42501';
  end if;
  select role_key into actuel from profiles where id = auth.uid();
  select rank into rang_actuel from roles where key = actuel;
  select rank into rang_code from roles where key = ligne.role_key;
  update role_codes set used_by = auth.uid(), used_at = now() where id = ligne.id;
  if coalesce(rang_actuel, 0) >= coalesce(rang_code, 0) then
    return actuel;
  end if;
  perform set_config('app.code_de_role', auth.uid()::text, true);
  update profiles set role_key = ligne.role_key where id = auth.uid();
  perform set_config('app.code_de_role', '', true);
  perform app_journaliser(auth.uid(), 'compte.code_utilise', jsonb_build_object('role', ligne.role_key, 'avant', actuel));
  return ligne.role_key;
end $$;

revoke execute on function public.creer_code_role(text), public.utiliser_code_role(text) from public, anon;
grant execute on function public.creer_code_role(text), public.utiliser_code_role(text) to authenticated;
