-- Verrous : les fonctions internes ne s'appellent plus sans être connecté,
-- et les deux fonctions de garde ont un chemin de recherche fixe.

revoke execute on function public.app_contenu_taille(uuid, uuid) from public, anon;
revoke execute on function public.app_dans_le_sac(uuid) from public, anon;
revoke execute on function public.app_lieu_de_remise(public.belonging_handoffs) from public, anon;
revoke execute on function public.app_sac_avec_place(uuid, integer) from public, anon;
revoke execute on function public.app_salle_ouverte(uuid, uuid) from public, anon;
revoke execute on function public.app_tient_le_dossier(uuid) from public, anon;
revoke execute on function public.app_garde_du_lieu() from public, anon;
revoke execute on function public.belongings_check_container() from public, anon;

grant execute on function public.app_contenu_taille(uuid, uuid) to authenticated;
grant execute on function public.app_dans_le_sac(uuid) to authenticated;
grant execute on function public.app_lieu_de_remise(public.belonging_handoffs) to authenticated;
grant execute on function public.app_sac_avec_place(uuid, integer) to authenticated;
grant execute on function public.app_salle_ouverte(uuid, uuid) to authenticated;
grant execute on function public.app_tient_le_dossier(uuid) to authenticated;
grant execute on function public.app_garde_du_lieu() to authenticated;
grant execute on function public.belongings_check_container() to authenticated;

alter function public.app_garde_du_lieu() set search_path = public;
alter function public.belongings_check_container() set search_path = public;
