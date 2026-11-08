-- 0035 — Les administrateurs sont désignés par leur compte Discord.
--
-- Avec la connexion Discord seule, il n'y a plus de pseudo ni de mot de passe
-- à promouvoir à la main : on liste ici l'IDENTIFIANT DISCORD (le nombre, pas
-- le pseudo) de chaque administrateur. À sa connexion, le site appelle
-- appliquer_admins_discord() et le rôle est accordé.
--
-- Sécurité : l'identifiant est lu dans auth.identities, que fixe Discord via
-- Supabase et que l'utilisateur ne peut pas modifier. On ne lit JAMAIS
-- raw_user_meta_data pour cela : ce champ, lui, est modifiable par chacun
-- depuis le navigateur (auth.updateUser).
--
-- Ne fait que promouvoir : retirer un administrateur se fait depuis
-- Administration › Comptes (et en le retirant de cette table).
--
-- Trouver un identifiant Discord : Paramètres › Avancés › Mode développeur,
-- puis clic droit sur le profil › « Copier l'identifiant ».

create table if not exists public.admins_discord (
  discord_id text primary key check (discord_id ~ '^[0-9]{15,22}$'),
  role_key   text not null default 'admin' check (role_key in ('admin', 'super_admin')),
  note       text,
  created_at timestamptz not null default now()
);

-- Table interne : aucune politique, donc aucun accès depuis le navigateur.
alter table public.admins_discord enable row level security;
revoke all on public.admins_discord from anon, authenticated;

-- À REMPLIR avec les deux identifiants (décommenter et remplacer) :
--
-- insert into public.admins_discord (discord_id, role_key, note) values
--   ('REMPLACER_PAR_ID_DISCORD_1', 'super_admin', 'Administrateur 1'),
--   ('REMPLACER_PAR_ID_DISCORD_2', 'admin',       'Administrateur 2')
-- on conflict (discord_id) do update set role_key = excluded.role_key, note = excluded.note;

-- Le rôle voulu pour un compte, d'après son identité Discord vérifiée.
create or replace function public.app_role_discord(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select a.role_key
    from auth.identities i
    join public.admins_discord a
      on a.discord_id = coalesce(i.provider_id, i.identity_data->>'sub')
   where i.user_id = uid and i.provider = 'discord'
   order by (a.role_key = 'super_admin') desc
   limit 1;
$$;

-- Appelée par le site à chaque ouverture de session. Promeut, jamais ne rétrograde.
create or replace function public.appliquer_admins_discord()
returns text language plpgsql security definer set search_path = public as $$
declare
  voulu text;
  actuel text;
  rang_voulu int;
  rang_actuel int;
begin
  if auth.uid() is null then
    return null;
  end if;
  voulu := app_role_discord(auth.uid());
  select role_key into actuel from profiles where id = auth.uid();
  if voulu is null or actuel is null then
    return actuel;
  end if;
  select rank into rang_voulu from roles where key = voulu;
  select rank into rang_actuel from roles where key = actuel;
  if coalesce(rang_actuel, 0) >= coalesce(rang_voulu, 0) then
    return actuel;
  end if;
  -- Même passage que les codes de rôle (0030) : le garde-fou des rôles laisse
  -- faire, mais seulement pour ce compte et seulement dans cette transaction.
  perform set_config('app.code_de_role', auth.uid()::text, true);
  update profiles set role_key = voulu where id = auth.uid();
  perform set_config('app.code_de_role', '', true);
  perform app_journaliser(auth.uid(), 'compte.admin_discord',
    jsonb_build_object('role', voulu, 'avant', actuel));
  return voulu;
end $$;

revoke execute on function public.app_role_discord(uuid) from public, anon, authenticated;
revoke execute on function public.appliquer_admins_discord() from public, anon;
grant  execute on function public.appliquer_admins_discord() to authenticated;
