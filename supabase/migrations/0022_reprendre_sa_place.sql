-- ============================================================================
-- CLASSE PARALLÈLE — Reprendre sa place
-- Migration 0022
--
-- Un élève laisse son crayon sur le bureau, la séance se ferme. Il revient à
-- la séance suivante : la salle est rouverte, le crayon est là… et pourtant
-- l'interface ne le montrait nulle part. `recover_belonging` le renvoyait au
-- sac — ou, sac plein ou absent, « dans les mains », c'est-à-dire chez soi,
-- donc invisible en séance. L'objet semblait avoir disparu.
--
-- Revenu à sa place, on retrouve ses affaires DEVANT SOI : sur le bureau de
-- la séance en cours. Mêmes conditions qu'avant — l'objet est à moi, il est
-- dans CETTE salle, et une séance s'y tient.
-- ============================================================================

create or replace function reprendre_a_ma_place(genre text, target uuid, seance uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  s class_sessions;
  classe uuid;
  proprietaire uuid;
  detenteur uuid;
  lieu text;
  session_lieu uuid;
begin
  select * into s from class_sessions where id = seance;
  if s.id is null or s.status <> 'live' then
    raise exception 'Aucune séance en cours ici : la salle est fermée.' using errcode = '42501';
  end if;

  if genre = 'cahier' then
    select place_class, owner_id, null, place, place_session
      into classe, proprietaire, detenteur, lieu, session_lieu
      from notebooks where id = target for update;
  else
    select place_class, owner_id, holder_id, place, place_session
      into classe, proprietaire, detenteur, lieu, session_lieu
      from belongings where id = target for update;
  end if;

  if proprietaire is null then raise exception 'Introuvable' using errcode = 'P0002'; end if;
  if proprietaire <> auth.uid() and detenteur is distinct from auth.uid() then
    raise exception 'Ce n''est pas à vous' using errcode = '42501';
  end if;
  if lieu = 'range' then return true; end if;
  if lieu = 'bureau' and session_lieu = seance then return true; end if;
  if classe is distinct from s.class_id then
    raise exception 'Cet objet a été laissé dans une autre salle.' using errcode = '42501';
  end if;

  perform set_config('app.recuperation', 'on', true);
  if genre = 'cahier' then
    update notebooks set place = 'bureau', place_session = seance, place_class = s.class_id,
           container_id = null
     where id = target;
  else
    update belongings set place = 'bureau', place_session = seance, place_class = s.class_id,
           container_id = null
     where id = target;
  end if;
  perform set_config('app.recuperation', 'off', true);
  return true;
end $$;

revoke all on function reprendre_a_ma_place(text, uuid, uuid) from public, anon;
grant execute on function reprendre_a_ma_place(text, uuid, uuid) to authenticated;
