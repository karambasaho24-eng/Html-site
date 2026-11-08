-- 0037 — Remettre à neuf : son propre compte, ou tout le site.
--
--  · reinitialiser_mon_compte() : chacun peut remettre SON compte à neuf (titre
--    retiré, espaces qu'il a créés supprimés). Le rôle ne bouge pas.
--  · reinitialiser_tout('TOUT EFFACER') : réservé aux super administrateurs.
--    Supprime tous les autres comptes et tout le contenu (espaces, cahiers,
--    papiers, affaires…). Seul le compte qui appuie reste, avec son rôle.
--    Le journal d'activité, les rôles, les permissions et l'apparence restent.
--
-- Les clés étrangères en cascade font le ménage derrière chaque suppression.

create or replace function public.reinitialiser_mon_compte()
returns text language plpgsql security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  n int;
  t text;
begin
  if moi is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  update profiles set titre = null, titre_libelle = null where id = moi;
  -- Une remise ne se réécrit pas : on retire d'abord celles liées à ces espaces,
  -- sinon la base refuserait de détacher la remise de l'espace supprimé.
  foreach t in array array['paper_handoffs', 'belonging_handoffs', 'notebook_handoffs'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = t and column_name = 'class_id') then
      execute format('delete from public.%I where class_id in (select id from public.classes where owner_id = $1)', t) using moi;
    end if;
  end loop;
  delete from classes where owner_id = moi;
  get diagnostics n = row_count;
  perform app_journaliser(moi, 'compte.reinitialise', jsonb_build_object('classes_supprimees', n));
  return format('Compte remis à neuf : titre retiré, %s espace(s) supprimé(s).', n);
end $$;

create or replace function public.reinitialiser_tout(confirmation text)
returns text language plpgsql security definer set search_path = public as $$
declare
  moi uuid := auth.uid();
  t text;
  n_comptes int;
  n_classes int;
begin
  if moi is null or not exists (select 1 from profiles where id = moi and role_key = 'super_admin') then
    raise exception 'Réservé aux super administrateurs.' using errcode = '42501';
  end if;
  if confirmation is distinct from 'TOUT EFFACER' then
    raise exception 'Confirmation incorrecte : tapez exactement TOUT EFFACER.' using errcode = '22023';
  end if;

  select count(*) into n_classes from classes;
  select count(*) into n_comptes from auth.users where id <> moi;

  foreach t in array array[
    'paper_handoffs', 'belonging_handoffs', 'notebook_handoffs',
    'classes', 'papers', 'belongings', 'notebooks', 'boards', 'folders', 'documents',
    'courses', 'exercises', 'announcements', 'notifications', 'sanctions',
    'moderation_notes', 'role_codes', 'rp_profiles', 'service_records',
    'sticky_notes', 'class_bags', 'dossier_items'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I', t);
    end if;
  end loop;

  delete from auth.users where id <> moi;
  update profiles set titre = null, titre_libelle = null where id = moi;

  perform app_journaliser(moi, 'site.reinitialise',
    jsonb_build_object('comptes_supprimes', n_comptes, 'classes_supprimees', n_classes));
  return format('Site remis à neuf : %s compte(s) et %s espace(s) supprimé(s). Il ne reste que vous.', n_comptes, n_classes);
end $$;

revoke execute on function public.reinitialiser_mon_compte() from public, anon;
revoke execute on function public.reinitialiser_tout(text) from public, anon;
grant  execute on function public.reinitialiser_mon_compte() to authenticated;
grant  execute on function public.reinitialiser_tout(text) to authenticated;
