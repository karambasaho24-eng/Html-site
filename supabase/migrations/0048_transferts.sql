-- ============================================================================
-- 0048 — Les transferts entre joueurs : un objet, un seul détenteur.
--
-- Les tables et procédures existent déjà (0016, 0038, 0046). Cette migration
-- corrige seulement leurs trous. Elle ne supprime aucune table et ne touche à
-- aucune ligne : elle remplace un index, une règle de lecture et pose des
-- gardes.
--
--   1. Un cahier DONNÉ restait marqué « accepté » pour toujours, et l'index
--      « une remise en cours par cahier » l'empêchait d'être redonné.
--   2. Un objet tendu et pas encore accepté se modifiait ou se supprimait
--      encore : il est désormais verrouillé jusqu'à la réponse.
--   3. Seul l'auteur d'un papier pouvait l'écrire. C'est son DÉTENTEUR qui
--      l'a en main : c'est lui qui écrit et qui signe.
--   4. Une remise de cahier se tranche une seule fois : le destinataire refuse,
--      l'expéditeur reprend, et plus rien ne bouge ensuite.
-- ============================================================================

-- 1. Un don accepté est terminé : seul un prêt accepté occupe encore le cahier.
drop index if exists nb_handoffs_en_cours;
create unique index nb_handoffs_en_cours on notebook_handoffs (notebook_id)
  where state = 'offered' or (state = 'accepted' and kind = 'lend');

-- 2a. Un papier tendu ne s'écrit pas et ne se jette pas.
create or replace function app_papier_verrouille() returns trigger
language plpgsql security definer set search_path = public as $$
declare cible uuid := coalesce(old.id, new.id);
begin
  -- L'acceptation (app_remise_papier_acceptee) change le détenteur alors que
  -- la remise est encore « offerte » : on la laisse passer.
  if tg_op = 'UPDATE' and new.holder_id is distinct from old.holder_id then
    return new;
  end if;
  if auth.uid() is not null
     and exists (select 1 from paper_handoffs where paper_id = cible and state = 'offered') then
    raise exception 'Ce papier est tendu : attendez la réponse, ou reprenez-le.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists papers_verrou_remise on papers;
create trigger papers_verrou_remise before update or delete on papers
  for each row execute function app_papier_verrouille();

-- 2b. Un cahier tendu ne s'écrit pas, ne se renomme pas, ne se jette pas.
create or replace function app_cahier_tendu(cible uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notebook_handoffs where notebook_id = cible and state = 'offered');
$$;

create or replace function app_cahier_verrouille() returns trigger
language plpgsql security definer set search_path = public as $$
declare cible uuid;
begin
  if tg_table_name = 'notebooks' then cible := coalesce(old.id, new.id);
  else cible := coalesce(old.notebook_id, new.notebook_id);
  end if;
  -- La procédure d'acceptation change le propriétaire alors que la remise est
  -- encore « offerte » : on la laisse passer (seul le propriétaire change).
  -- (deux « if » imbriqués : une page n'a pas de colonne owner_id, et
  -- PL/pgSQL n'évite pas toujours de lire le second membre d'un « and »).
  if tg_table_name = 'notebooks' and tg_op = 'UPDATE' then
    if new.owner_id is distinct from old.owner_id then
      return new;
    end if;
  end if;
  if auth.uid() is not null and app_cahier_tendu(cible) then
    raise exception 'Ce cahier est tendu : attendez la réponse, ou reprenez-le.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists notebooks_verrou_remise on notebooks;
create trigger notebooks_verrou_remise before update or delete on notebooks
  for each row execute function app_cahier_verrouille();
drop trigger if exists notebook_pages_verrou_remise on notebook_pages;
create trigger notebook_pages_verrou_remise before insert or update or delete on notebook_pages
  for each row execute function app_cahier_verrouille();

-- 3. Le détenteur écrit et signe son papier.
drop policy if exists papers_update on papers;
create policy papers_update on papers
  for update to authenticated
  using (holder_id = auth.uid())
  with check (holder_id = auth.uid());

-- 4. Une remise de cahier se tranche une fois, par la bonne personne.
create or replace function app_garde_remise_cahier() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.notebook_id <> old.notebook_id or new.from_user <> old.from_user
     or new.to_user <> old.to_user or new.kind <> old.kind then
    raise exception 'Une remise ne se réécrit pas.' using errcode = '42501';
  end if;
  if new.state = old.state then
    return new;
  end if;
  if old.state = 'offered' and new.state = 'cancelled' and auth.uid() = old.from_user then
    return new;
  end if;
  if old.state = 'offered' and new.state = 'refused' and auth.uid() = old.to_user then
    return new;
  end if;
  -- Un prêt accepté se rend (l'un ou l'autre peut y mettre fin).
  if old.state = 'accepted' and old.kind = 'lend' and new.state = 'returned' then
    return new;
  end if;
  -- L'acceptation passe par accept_notebook_handoff (security definer).
  if old.state = 'offered' and new.state = 'accepted' and auth.uid() = old.to_user then
    return new;
  end if;
  raise exception 'Cette remise est déjà tranchée.' using errcode = '42501';
end $$;

drop trigger if exists notebook_handoffs_garde on notebook_handoffs;
create trigger notebook_handoffs_garde before update on notebook_handoffs
  for each row execute function app_garde_remise_cahier();

-- 5. Écrire sur un papier coûte de l'encre, comme sur une page de cahier :
--    une seule jauge (même règle que les pense-bêtes, 0039).
drop trigger if exists papers_encre on papers;
create trigger papers_encre before insert or update of body on papers
  for each row execute function app_encre_pensebetes();
