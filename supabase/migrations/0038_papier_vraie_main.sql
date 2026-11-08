-- 0038 — Un papier a UN détenteur : donner, c'est ne plus l'avoir.
--
-- Avant : « tendre » faisait une copie par destinataire ; l'expéditeur gardait
-- l'original. Maintenant le papier lui-même passe de main en main :
--   · papers.holder_id = qui l'a en main (à la création : son auteur) ;
--   · tendre : le papier sort de la sacoche de l'expéditeur (remise « offered ») ;
--   · accepté : il passe dans la sacoche du destinataire (trigger ci-dessous) ;
--   · refusé / retiré : il revient dans la sacoche de l'expéditeur ;
--   · le détenteur peut le jeter ou le déchirer (supprimer) ; l'auteur ne peut
--     plus le modifier une fois qu'il l'a donné.
-- L'auteur reste inscrit sur le papier (« Rédigé par … »).

alter table public.papers
  add column if not exists holder_id uuid references auth.users(id) on delete set null;

-- Les papiers existants : en main chez leur auteur, sauf ceux déjà acceptés.
update public.papers set holder_id = author_id where holder_id is null;
update public.papers p set holder_id = h.to_user
  from public.paper_handoffs h
 where h.paper_id = p.id and h.state = 'accepted';

create index if not exists papers_holder_idx on public.papers (holder_id);

create or replace function public.app_papier_detenteur()
returns trigger language plpgsql as $$
begin
  new.holder_id := coalesce(new.holder_id, new.author_id);
  return new;
end $$;
drop trigger if exists papers_detenteur on public.papers;
create trigger papers_detenteur before insert on public.papers
  for each row execute function public.app_papier_detenteur();

-- Lire : son auteur, son détenteur, le destinataire d'une remise, l'encadrement…
drop policy if exists papers_read on public.papers;
create policy papers_read on public.papers for select using (
  author_id = auth.uid() or holder_id = auth.uid()
  or exists (select 1 from public.paper_handoffs h where h.paper_id = papers.id and h.to_user = auth.uid())
  or (class_id is not null and app_is_staff(class_id))
  or exists (select 1 from public.dossier_items d where d.paper_id = papers.id and app_tient_le_dossier(d.dossier_id))
  or app_is_moderator()
);

-- Écrire : on rédige pour soi ; on ne modifie que ce qu'on a encore en main ;
-- on jette ou déchire ce qu'on tient (même reçu d'un autre).
drop policy if exists papers_write on public.papers;
drop policy if exists papers_insert on public.papers;
drop policy if exists papers_update on public.papers;
drop policy if exists papers_delete_holder on public.papers;
create policy papers_insert on public.papers for insert to authenticated
  with check (author_id = auth.uid() and coalesce(holder_id, author_id) = auth.uid());
create policy papers_update on public.papers for update to authenticated
  using (author_id = auth.uid() and holder_id = auth.uid())
  with check (author_id = auth.uid() and holder_id = auth.uid());
create policy papers_delete_holder on public.papers for delete to authenticated
  using (holder_id = auth.uid());

-- Tendre : on ne tend que ce qu'on tient, et pas deux fois en même temps.
drop policy if exists handoffs_offer on public.paper_handoffs;
create policy handoffs_offer on public.paper_handoffs for insert with check (
  from_user = auth.uid()
  and exists (select 1 from public.papers p where p.id = paper_handoffs.paper_id and p.holder_id = auth.uid())
);
create unique index if not exists paper_handoffs_une_offre
  on public.paper_handoffs (paper_id) where state = 'offered';

-- Accepté : le papier change de main et quitte les dossiers de l'expéditeur.
create or replace function public.app_remise_papier_acceptee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.state = 'accepted' and old.state is distinct from 'accepted' then
    update public.papers set holder_id = new.to_user where id = new.paper_id;
    delete from public.dossier_items where paper_id = new.paper_id;
  end if;
  return new;
end $$;
drop trigger if exists paper_handoffs_transfert on public.paper_handoffs;
create trigger paper_handoffs_transfert after update on public.paper_handoffs
  for each row execute function public.app_remise_papier_acceptee();

-- Le journal de modération ne note pas qu'on jette ce qu'on tient soi-même.
create or replace function public.app_journal_papier_retire()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> old.author_id and auth.uid() is distinct from old.holder_id then
    perform app_journaliser(auth.uid(), 'moderation.papier_retire',
      jsonb_build_object('papier', old.id, 'titre', old.title, 'auteur', old.author_id));
  end if;
  return old;
end $$;
