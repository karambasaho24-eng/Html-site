-- 0044 — Chacun choisit son nom RP, une seule fois.
--
-- Complète 0043. Règles :
--   · chaque personne peut choisir le nom de son personnage UNE fois (il
--     remplace alors son pseudo Discord à l'affichage) ;
--   · l'administration peut le modifier directement quand elle veut ;
--   · quand le personnage meurt, l'administration le déclare : la personne
--     peut alors choisir un nouveau nom (une fois de plus) ;
--   · deux personnes ne portent pas le même nom (on ne se fait pas passer
--     pour un autre) ;
--   · tout est inscrit au journal.
-- `nom_rp_libre` = « la personne a encore un choix de nom RP à faire ».

alter table public.profiles add column if not exists nom_rp_libre boolean not null default true;

-- Les comptes déjà renommés par l'administration (0043) ont leur nom : plus de choix.
update public.profiles set nom_rp_libre = false where discord_name is not null;

-- Le garde : un simple joueur ne touche ni au nom affiché ni au droit de le choisir,
-- sauf par les deux procédures ci-dessous (qui lèvent le drapeau le temps de la transaction).
create or replace function public.app_garde_nom()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or app_is_admin()
     or coalesce(current_setting('app.nom_rp_rpc', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.display_name is distinct from old.display_name
          or new.discord_name is distinct from old.discord_name
          or new.nom_rp_libre is distinct from old.nom_rp_libre) then
    raise exception 'Seule l''administration change le nom affiché.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Choisir son nom RP (une fois, ou de nouveau après la mort du personnage).
create or replace function public.choisir_mon_nom_rp(nom text)
returns text language plpgsql security definer set search_path = public as $$
declare
  p      profiles;
  propre text := nullif(btrim(regexp_replace(coalesce(nom, ''), '\s+', ' ', 'g')), '');
  neuf   text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into p from profiles where id = auth.uid();
  if not found then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
  if not p.nom_rp_libre then
    raise exception 'Votre nom RP est déjà choisi. Il ne change que si votre personnage meurt, ou par l''administration.'
      using errcode = '42501';
  end if;
  if propre is null or char_length(propre) < 2 or char_length(propre) > 60 then
    raise exception 'Le nom RP doit faire entre 2 et 60 caractères.' using errcode = '22023';
  end if;
  if exists (
    select 1 from profiles o
     where o.id <> p.id
       and (lower(o.display_name) = lower(propre) or lower(coalesce(o.discord_name, '')) = lower(propre))
  ) then
    raise exception 'Ce nom est déjà porté par quelqu''un d''autre.' using errcode = '23505';
  end if;

  perform set_config('app.nom_rp_rpc', '1', true);
  update profiles
     set display_name = propre,
         discord_name = coalesce(discord_name, display_name),
         nom_rp_libre = false
   where id = p.id returning display_name into neuf;

  perform app_journaliser(auth.uid(), 'compte.nom_rp_choisi',
    jsonb_build_object('cible', p.id, 'avant', p.display_name, 'apres', neuf,
                       'discord', coalesce(p.discord_name, p.display_name)));
  return neuf;
end $$;

revoke execute on function public.choisir_mon_nom_rp(text) from public, anon;
grant execute on function public.choisir_mon_nom_rp(text) to authenticated;

-- Le personnage est mort : la personne peut choisir un nouveau nom. Administration seule.
create or replace function public.declarer_personnage_mort(cible uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  p profiles;
begin
  if not app_peut_nommer() then
    raise exception 'Seule l''administration déclare un personnage mort.' using errcode = '42501';
  end if;
  select * into p from profiles where id = cible;
  if not found then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
  if p.role_key = 'pdg' and not app_is_pdg() then
    raise exception 'Seul le PDG touche au compte du PDG.' using errcode = '42501';
  end if;
  if p.role_key = 'super_admin' and not app_is_super_admin() then
    raise exception 'Seul un super administrateur touche à ce compte.' using errcode = '42501';
  end if;
  update profiles set nom_rp_libre = true where id = cible;
  perform app_journaliser(auth.uid(), 'compte.personnage_mort',
    jsonb_build_object('cible', cible, 'nom', p.display_name));
  return p.display_name;
end $$;

revoke execute on function public.declarer_personnage_mort(uuid) from public, anon;
grant execute on function public.declarer_personnage_mort(uuid) to authenticated;

-- L'administration renomme directement : le choix de la personne est alors clos
-- (nom vide = retour au pseudo Discord, et le choix est rendu).
create or replace function public.definir_nom_rp(cible uuid, nom text)
returns text language plpgsql security definer set search_path = public as $$
declare
  p      profiles;
  propre text := nullif(btrim(regexp_replace(coalesce(nom, ''), '\s+', ' ', 'g')), '');
  neuf   text;
begin
  if not app_peut_nommer() then
    raise exception 'Seule l''administration change un nom RP.' using errcode = '42501';
  end if;
  select * into p from profiles where id = cible;
  if not found then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
  if p.role_key = 'pdg' and not app_is_pdg() then
    raise exception 'Seul le PDG renomme le PDG.' using errcode = '42501';
  end if;
  if p.role_key = 'super_admin' and not app_is_super_admin() then
    raise exception 'Seul un super administrateur renomme un super administrateur.' using errcode = '42501';
  end if;

  if propre is null then
    update profiles set display_name = coalesce(p.discord_name, p.display_name), discord_name = null, nom_rp_libre = true
     where id = cible returning display_name into neuf;
  else
    if char_length(propre) < 2 or char_length(propre) > 60 then
      raise exception 'Le nom RP doit faire entre 2 et 60 caractères.' using errcode = '22023';
    end if;
    update profiles set display_name = propre, discord_name = coalesce(p.discord_name, p.display_name), nom_rp_libre = false
     where id = cible returning display_name into neuf;
  end if;

  perform app_journaliser(auth.uid(), 'compte.nom_rp',
    jsonb_build_object('cible', cible, 'avant', p.display_name, 'apres', neuf, 'discord', coalesce(p.discord_name, p.display_name)));
  return neuf;
end $$;
