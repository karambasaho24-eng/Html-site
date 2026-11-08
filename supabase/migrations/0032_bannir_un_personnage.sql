-- 0032 — Bannir un personnage.
--
-- Plus doux que supprimer le compte : le joueur garde son compte, mais son
-- personnage disparaît — son titre, son apparence, ses fiches. À sa
-- prochaine visite, un message de fin lui donne la raison et l'invite à
-- recommencer un nouveau personnage.
--
-- La modération peut bannir un membre ; seule l'administration bannit un
-- modérateur ou un administrateur, et seul un super administrateur bannit
-- un super administrateur. Jamais soi-même. Inscrit au journal.
--
-- Les fiches (rp_profiles) sont retirées par l'interface : la politique
-- rp_profiles_delete (0029) l'autorise déjà à la modération.

-- Le garde des rôles laisse aussi passer le bannissement (le titre tombe).
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
     and not app_peut_nommer()
     and coalesce(current_setting('app.bannissement', true), '') <> old.id::text then
    raise exception 'Un titre est attribué par l''administration.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.bannir_personnage(cible uuid, raison text)
returns text language plpgsql security definer set search_path = public as $$
declare
  p profiles;
begin
  if not app_is_moderator() then
    raise exception 'Réservé à la modération.' using errcode = '42501';
  end if;
  if cible = auth.uid() then
    raise exception 'On ne bannit pas son propre personnage.' using errcode = '42501';
  end if;
  if coalesce(btrim(raison), '') = '' or char_length(raison) > 600 then
    raise exception 'Donnez une raison (600 caractères au plus).' using errcode = '22023';
  end if;
  select * into p from profiles where id = cible;
  if not found then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
  if p.role_key in ('moderator', 'admin', 'director') and not app_peut_nommer() then
    raise exception 'Seule l''administration bannit un membre de l''encadrement.' using errcode = '42501';
  end if;
  if p.role_key = 'super_admin' and not app_is_super_admin() then
    raise exception 'Seul un super administrateur bannit un super administrateur.' using errcode = '42501';
  end if;

  perform set_config('app.bannissement', cible::text, true);
  update profiles
     set titre = null, titre_libelle = null,
         preferences = coalesce(preferences, '{}'::jsonb) - 'avatar'
                       || jsonb_build_object('bannissement', jsonb_build_object(
                            'raison', btrim(raison), 'le', now(), 'lu', false))
   where id = cible;
  perform set_config('app.bannissement', '', true);

  insert into notifications (user_id, kind, title, body)
  values (cible, 'bannissement', 'Votre personnage a été banni', btrim(raison));
  perform app_journaliser(auth.uid(), 'personnage.banni',
    jsonb_build_object('cible', p.id, 'nom', p.display_name, 'raison', btrim(raison)));
  return p.display_name;
end $$;

revoke execute on function public.bannir_personnage(uuid, text) from public, anon;
grant execute on function public.bannir_personnage(uuid, text) to authenticated;
