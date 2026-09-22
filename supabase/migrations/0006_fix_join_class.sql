-- ============================================================================
-- OJM ACADEMY — Correctif
-- Migration 0006 : join_class échouait systématiquement.
--
-- La fonction déclare « returns table (class_id uuid, …) » : PL/pgSQL crée donc
-- une variable nommée class_id. Dans « on conflict (class_id, user_id) », la
-- cible d'inférence ne peut pas être qualifiée, et Postgres refuse la référence
-- ambiguë (42702). Aucun élève ne pouvait rejoindre une classe.
--
-- On remplace l'UPSERT par une branche explicite : on sait déjà, grâce au
-- SELECT précédent, si une inscription existe.
-- ============================================================================

create or replace function join_class(join_code text)
returns table (class_id uuid, class_name text, member_status text)
language plpgsql volatile security definer set search_path = public as $$
declare
  target classes%rowtype;
  wanted_status member_status;
  existing class_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  select * into target from classes
   where code = upper(btrim(join_code)) and archived = false;

  if target.id is null then
    raise exception 'Code de classe introuvable' using errcode = 'P0002';
  end if;

  select * into existing from class_members m
   where m.class_id = target.id and m.user_id = auth.uid();

  if existing.id is not null and existing.status = 'banned' then
    raise exception 'Accès à cette classe révoqué' using errcode = '42501';
  end if;

  if existing.id is not null and existing.status = 'active' then
    return query select target.id, target.name, 'active'::text;
    return;
  end if;

  if target.locked or not target.join_open then
    raise exception 'Les inscriptions sont fermées' using errcode = '42501';
  end if;

  wanted_status := case when target.require_approval then 'pending' else 'active' end;

  if existing.id is not null then
    update class_members m
       set status = wanted_status,
           role   = coalesce(m.role, 'student')
     where m.id = existing.id;
  else
    insert into class_members (class_id, user_id, role, status)
    values (target.id, auth.uid(), 'student', wanted_status);
  end if;

  insert into activity_logs (class_id, user_id, action, meta)
  values (target.id, auth.uid(), 'class.join', jsonb_build_object('code', target.code));

  return query select target.id, target.name, wanted_status::text;
end $$;

revoke all on function join_class(text) from public, anon, authenticated;
grant execute on function join_class(text) to authenticated;
