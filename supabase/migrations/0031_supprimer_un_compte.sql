-- 0031 — Supprimer un compte.
--
-- L'administration peut supprimer un compte : le joueur, son profil, ses
-- fiches, ses cahiers, ses papiers, ses affaires et les espaces qu'il a
-- créés partent avec lui (tout suit en cascade). C'est définitif.
--
-- Règles : l'administration seule ; jamais son propre compte ; un super
-- administrateur ne peut être supprimé que par un super administrateur. La
-- suppression est inscrite au journal avant d'avoir lieu.

create or replace function public.supprimer_compte(cible uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  p profiles;
begin
  if not app_peut_nommer() then
    raise exception 'Seule l''administration supprime un compte.' using errcode = '42501';
  end if;
  if cible = auth.uid() then
    raise exception 'On ne supprime pas son propre compte.' using errcode = '42501';
  end if;
  select * into p from profiles where id = cible;
  if not found then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
  if p.role_key = 'super_admin' and not app_is_super_admin() then
    raise exception 'Seul un super administrateur supprime un super administrateur.' using errcode = '42501';
  end if;
  perform app_journaliser(auth.uid(), 'compte.supprime',
    jsonb_build_object('cible', p.id, 'nom', p.display_name, 'role', p.role_key));
  delete from auth.users where id = cible;
  return p.display_name;
end $$;

revoke execute on function public.supprimer_compte(uuid) from public, anon;
grant execute on function public.supprimer_compte(uuid) to authenticated;
