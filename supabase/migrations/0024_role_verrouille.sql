-- Le rôle global (role_key) ne se choisit pas soi-même.
--
-- 1. À l'inscription, le rôle envoyé par le navigateur était recopié tel
--    quel : n'importe qui pouvait s'inscrire administrateur en appelant
--    l'API directement. Désormais, tout nouveau compte est élève.
-- 2. La règle « chacun modifie son profil » laissait aussi changer son
--    propre rôle. Seule l'administration change un rôle ; le reste du profil
--    (nom, préférences, apparence…) reste à son propriétaire.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role_key)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Nouvel élève'),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.app_garde_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Le serveur lui-même (inscription, console d'administration) passe.
  if auth.uid() is null or app_is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role_key := 'student';
  elsif new.role_key is distinct from old.role_key then
    raise exception 'Seule l''administration change un rôle.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_garde_role on public.profiles;
create trigger profiles_garde_role
  before insert or update on public.profiles
  for each row execute function public.app_garde_role();

revoke execute on function public.app_garde_role() from public, anon;
