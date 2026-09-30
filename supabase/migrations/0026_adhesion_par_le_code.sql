-- On n'entre dans une classe que par son code.
--
-- La règle « members_self_join » laissait n'importe quel compte s'inscrire
-- directement dans une classe dont il connaissait l'identifiant (visible
-- dans les liens partagés), sans code, malgré le verrou, les inscriptions
-- fermées ou la validation manuelle. Le site passe toujours par join_class,
-- qui vérifie tout cela : la porte dérobée se ferme.

drop policy if exists members_self_join on public.class_members;

-- La garde du rôle n'est qu'un déclencheur : personne n'a à l'appeler.
revoke execute on function public.app_garde_role() from authenticated;
