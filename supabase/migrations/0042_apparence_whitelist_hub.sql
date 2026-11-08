-- 0042 — L'apparence du site, comme sur Whitelist Hub.
--
-- Les réglages (couleur du verre, transparence, flou, fond vidéo ou image, zoom,
-- assombrissement, musique, logo, icône, nom) vivent dans la ligne « apparence »
-- de site_settings (jsonb) : rien à changer dans la table, le navigateur borne
-- chaque valeur avant usage. Cette migration :
--   1. ramène l'ancien réglage (couleur, verre, flou) au format d'aujourd'hui ;
--   2. crée le stockage public « site-assets » (logo, icône, vidéo de fond,
--      musique), en lecture pour tous, en écriture pour l'administration.

update public.site_settings
set valeur = jsonb_build_object(
      'tint',  coalesce(valeur->>'tint', valeur->>'couleur', '#ffffff'),
      'glass', coalesce((valeur->>'glass')::int, (valeur->>'verre')::int, 70),
      'blur',  coalesce((valeur->>'blur')::int,  (valeur->>'flou')::int,  16),
      'dim',   coalesce((valeur->>'dim')::int,   (valeur->>'voile')::int, 18),
      'zoom',  coalesce((valeur->>'zoom')::int, 100),
      'vol',   coalesce((valeur->>'vol')::int, 50),
      'fond',  coalesce(valeur->>'fond', ''),
      'video', coalesce(valeur->>'video', ''),
      'audio', coalesce(valeur->>'audio', ''),
      'logo',  coalesce(valeur->>'logo', ''),
      'icone', coalesce(valeur->>'icone', ''),
      'nom',   coalesce(valeur->>'nom', '')
    )
where id = 'apparence' and valeur ? 'verre';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 52428800,
        array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/ogg','audio/wav','audio/mp4'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_assets_lecture on storage.objects;
create policy site_assets_lecture on storage.objects
  for select using (bucket_id = 'site-assets');

drop policy if exists site_assets_ecriture on storage.objects;
create policy site_assets_ecriture on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'site'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role_key in ('admin','super_admin','pdg')));

drop policy if exists site_assets_suppression on storage.objects;
create policy site_assets_suppression on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'site'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role_key in ('admin','super_admin','pdg')));
