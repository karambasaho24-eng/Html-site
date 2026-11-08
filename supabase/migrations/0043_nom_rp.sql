-- 0043 — Le nom RP à la place du pseudo Discord.
--
-- Une personne qui se connecte par Discord arrive avec son pseudo Discord comme
-- nom d'affichage. Pour certaines personnes, on veut que le site affiche
-- directement le nom de leur personnage : c'est `display_name` qui est affiché
-- partout (classes, cahiers, séances, journal…), on y met donc le nom RP, et le
-- pseudo Discord d'origine est mis de côté dans `discord_name` pour que
-- l'encadrement sache toujours qui est qui.
--
-- Règles :
--   · seule l'administration attribue (ou retire) un nom RP, par la procédure
--     definir_nom_rp : on ne se renomme pas soi-même (sinon n'importe qui
--     pourrait prendre le nom d'un autre) ;
--   · un nom RP vide rend à la personne son pseudo Discord ;
--   · un PDG ne se renomme que par le PDG, un super administrateur que par un
--     super administrateur ;
--   · chaque changement est inscrit au journal.

alter table public.profiles add column if not exists discord_name text;
do $$ begin
  alter table public.profiles add constraint profiles_discord_name_long
    check (discord_name is null or char_length(discord_name) <= 60);
exception when duplicate_object then null; end $$;

-- Le nom affiché ne se change plus depuis le navigateur d'un simple joueur.
create or replace function public.app_garde_nom()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or app_is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.display_name is distinct from old.display_name
          or new.discord_name is distinct from old.discord_name) then
    raise exception 'Seule l''administration change le nom affiché.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_garde_nom on public.profiles;
create trigger profiles_garde_nom
  before update on public.profiles
  for each row execute function public.app_garde_nom();

revoke execute on function public.app_garde_nom() from public, anon;

-- Attribuer (ou retirer) le nom RP d'une personne. Rend le nom désormais affiché.
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
    -- Retour au pseudo Discord d'origine.
    update profiles set display_name = coalesce(p.discord_name, p.display_name), discord_name = null
     where id = cible returning display_name into neuf;
  else
    if char_length(propre) < 2 or char_length(propre) > 60 then
      raise exception 'Le nom RP doit faire entre 2 et 60 caractères.' using errcode = '22023';
    end if;
    update profiles set display_name = propre, discord_name = coalesce(p.discord_name, p.display_name)
     where id = cible returning display_name into neuf;
  end if;

  perform app_journaliser(auth.uid(), 'compte.nom_rp',
    jsonb_build_object('cible', cible, 'avant', p.display_name, 'apres', neuf, 'discord', coalesce(p.discord_name, p.display_name)));
  return neuf;
end $$;

revoke execute on function public.definir_nom_rp(uuid, text) from public, anon;
grant execute on function public.definir_nom_rp(uuid, text) to authenticated;
