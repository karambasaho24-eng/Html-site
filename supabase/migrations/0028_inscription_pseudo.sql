-- On s'inscrit avec son pseudo RP et un mot de passe : plus de courriel.
--
-- Supabase veut une adresse pour chaque compte. On la dérive du pseudo
-- (empreinte, domaine qui ne reçoit rien) : personne ne la voit, personne ne
-- la tape. Le compte est créé ici, côté serveur, déjà confirmé — aucun
-- message n'est envoyé, aucune attente. La connexion demande au serveur
-- l'adresse qui correspond au pseudo, puis ouvre la session normalement.

-- L'adresse d'un pseudo : même pseudo (majuscules et espaces mis à part),
-- même adresse. Ne lit aucune table : elle ne dit pas si le pseudo existe.
create or replace function public.courriel_du_pseudo(pseudo text)
returns text language sql immutable set search_path = public, extensions as $$
  select 'j' || left(encode(extensions.digest(convert_to(
           lower(regexp_replace(btrim(coalesce(pseudo, '')), '\s+', ' ', 'g')), 'UTF8'), 'sha256'), 'hex'), 40)
         || '@joueurs.classe-parallele.fr'
$$;

create or replace function public.inscrire_pseudo(pseudo text, mot_de_passe text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  propre text := regexp_replace(btrim(coalesce(pseudo, '')), '\s+', ' ', 'g');
  adresse text;
  nouveau uuid := gen_random_uuid();
begin
  if char_length(propre) < 3 or char_length(propre) > 24 then
    raise exception 'Le pseudo doit faire entre 3 et 24 caractères.' using errcode = '22023';
  end if;
  if propre !~ '^[[:alnum:]][[:alnum:] ''._-]*[[:alnum:]]$' then
    raise exception 'Le pseudo ne peut contenir que des lettres, des chiffres, des espaces et - _ . ''' using errcode = '22023';
  end if;
  if char_length(coalesce(mot_de_passe, '')) < 8 then
    raise exception 'Le mot de passe doit faire au moins 8 caractères.' using errcode = '22023';
  end if;
  adresse := public.courriel_du_pseudo(propre);
  if exists (select 1 from auth.users where email = adresse) then
    raise exception 'Ce pseudo est déjà pris.' using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', nouveau, 'authenticated', 'authenticated',
    adresse, extensions.crypt(mot_de_passe, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', propre, 'pseudo', propre),
    now(), now(), '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (nouveau::text, nouveau,
          jsonb_build_object('sub', nouveau::text, 'email', adresse, 'email_verified', true),
          'email', now(), now(), now());
  -- Le profil (nom affiché = pseudo, rôle élève) est créé par handle_new_user.
  return adresse;
end $$;

revoke execute on function public.inscrire_pseudo(text, text) from public;
grant execute on function public.inscrire_pseudo(text, text) to anon, authenticated;
grant execute on function public.courriel_du_pseudo(text) to anon, authenticated;

-- L'administration remet un mot de passe à un joueur qui l'a oublié (il n'y
-- a plus de courriel pour le faire soi-même).
create or replace function public.admin_mot_de_passe(cible uuid, nouveau text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app_is_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  if char_length(coalesce(nouveau, '')) < 8 then
    raise exception 'Le mot de passe doit faire au moins 8 caractères.' using errcode = '22023';
  end if;
  update auth.users set encrypted_password = extensions.crypt(nouveau, extensions.gen_salt('bf')), updated_at = now()
   where id = cible;
end $$;
revoke execute on function public.admin_mot_de_passe(uuid, text) from public, anon;
grant execute on function public.admin_mot_de_passe(uuid, text) to authenticated;
