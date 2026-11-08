-- 0036 — L'apparence du site (couleur du « liquid glass ») : un réglage global,
-- lisible par tous (même avant la connexion), modifiable par les administrateurs
-- seulement, diffusé en temps réel à tous les écrans ouverts.

create table if not exists public.site_settings (
  id        text primary key,
  valeur    jsonb not null default '{}'::jsonb,
  maj       timestamptz not null default now(),
  maj_par   uuid references auth.users(id) on delete set null
);

alter table public.site_settings enable row level security;

drop policy if exists site_settings_lecture on public.site_settings;
create policy site_settings_lecture on public.site_settings
  for select to anon, authenticated using (true);

drop policy if exists site_settings_ecriture on public.site_settings;
create policy site_settings_ecriture on public.site_settings
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role_key in ('admin','super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role_key in ('admin','super_admin')));

insert into public.site_settings (id, valeur)
values ('apparence', '{"couleur":"#4f8cff","intensite":0.5}'::jsonb)
on conflict (id) do nothing;

do $$ begin
  alter publication supabase_realtime add table public.site_settings;
exception when duplicate_object then null; end $$;
