-- 0034 — Connexion par Discord.
--
-- La connexion se fait désormais uniquement par Discord (OAuth via Supabase).
-- À la première connexion, le profil est créé automatiquement à partir du
-- compte Discord : nom d'affichage (surnom global, sinon nom d'utilisateur) et
-- avatar. Tout nouveau compte est élève ; le rôle ne vient jamais du client.
--
-- Prérequis côté Supabase : Authentication › Providers › Discord activé, avec
-- l'identifiant client et le secret de l'application Discord.

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nom  text;
begin
  nom := nullif(btrim(coalesce(
    meta->'custom_claims'->>'global_name',
    meta->>'full_name',
    meta->>'name',
    meta->>'user_name',
    meta->>'display_name',
    split_part(coalesce(new.email, ''), '@', 1)
  )), '');

  insert into public.profiles (id, display_name, avatar_url, role_key)
  values (
    new.id,
    left(coalesce(nom, 'Nouvel élève'), 60),
    nullif(meta->>'avatar_url', ''),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- L'inscription par pseudo + mot de passe n'est plus proposée : on retire
-- l'accès public à la fonction pour que personne ne contourne Discord.
revoke execute on function public.inscrire_pseudo(text, text) from anon, authenticated;
revoke execute on function public.courriel_du_pseudo(text) from anon, authenticated;
