-- ============================================================================
-- 0041 — Le paiement se fait EN JEU, pas sur le site.
--
-- Ce que cette migration change par rapport à 0039 :
--
--   1. PLUS DE PRESTATAIRE DE PAIEMENT. Le site ne traite aucun paiement. Pour
--      de l'encre ou un cahier supplémentaire, l'élève envoie une MISSIVE DE
--      COMMANDE (un pigeon voyageur). Le PDG la livre en jeu, s'il a été payé
--      et si l'élève est à proximité, puis la marque livrée : c'est ce geste, et
--      lui seul, qui crédite l'encre ou le droit de créer un cahier.
--      → start_purchase() et fulfill_purchase() sont supprimées.
--
--   2. UNE LIMITE DE PAGES par cahier, réglable (réglage max_pages, 0 = aucune).
--
--   3. UNE RÉSERVE DE DÉPART PLUS PETITE (réglage starter_ink), réglable.
--
--   4. UN RÔLE « PDG », au-dessus des super administrateurs : seul le PDG fait
--      ou défait un PDG ou un super administrateur ; personne d'autre ne peut le
--      supprimer, le sanctionner ni changer son rôle.
--
-- Cette migration n'efface aucune donnée. Elle suppose 0039 appliquée.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Le rôle PDG
-- ---------------------------------------------------------------------------
insert into public.roles (key, label, rank, description) values
  ('pdg', 'PDG', 110, 'Fondateur : contrôle total ; seul à nommer les super administrateurs')
on conflict (key) do update
  set label = excluded.label, rank = excluded.rank, description = excluded.description;

-- Tous les droits, y compris ceux qu'on ajoutera plus tard à la main.
insert into public.role_permissions (role_key, permission_key)
select 'pdg', p.key from public.permissions p
on conflict do nothing;

-- La boutique : le PDG et les super administrateurs. Plus les administrateurs simples.
delete from public.role_permissions where role_key = 'admin' and permission_key = 'MANAGE_SHOP';
insert into public.role_permissions (role_key, permission_key)
select r.key, 'MANAGE_SHOP' from public.roles r where r.key in ('pdg', 'super_admin')
on conflict do nothing;

create or replace function public.app_is_pdg() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role_key = 'pdg');
$$;

-- Le PDG est, en plus, tout ce que sont les autres rôles de direction.
create or replace function public.app_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role_key in ('pdg', 'super_admin', 'admin', 'director')
  );
$$;

create or replace function public.app_peut_nommer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role_key in ('pdg', 'super_admin', 'admin')
  );
$$;

-- « Super administrateur » : le PDG l'est aussi (toutes les vérifications existantes passent pour lui).
create or replace function public.app_is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role_key in ('pdg', 'super_admin'));
$$;

create or replace function public.app_is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role_key in ('moderator', 'admin', 'super_admin', 'pdg')
  );
$$;

-- Le garde des rôles (dernière version : 0032), avec le PDG en plus :
--   · seul le PDG fait ou défait un PDG ;
--   · seul le PDG fait ou défait un super administrateur (un super administrateur
--     ne nomme plus ses pairs : c'est la décision du fondateur).
create or replace function public.app_garde_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not app_peut_nommer() then
      new.role_key := 'student';
      new.titre := null;
      new.titre_libelle := null;
    end if;
    return new;
  end if;

  if new.role_key is distinct from old.role_key
     and coalesce(current_setting('app.code_de_role', true), '') <> old.id::text then
    if not app_peut_nommer() then
      raise exception 'Seule l''administration change un rôle.' using errcode = '42501';
    end if;
    if old.id = auth.uid() then
      raise exception 'On ne change pas son propre rôle.' using errcode = '42501';
    end if;
    if (new.role_key in ('pdg', 'super_admin') or old.role_key in ('pdg', 'super_admin')) and not app_is_pdg() then
      raise exception 'Seul le PDG fait ou défait un super administrateur.' using errcode = '42501';
    end if;
  end if;

  if (new.titre is distinct from old.titre or new.titre_libelle is distinct from old.titre_libelle)
     and not app_peut_nommer()
     and coalesce(current_setting('app.bannissement', true), '') <> old.id::text then
    raise exception 'Un titre est attribué par l''administration.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Le PDG ne se supprime pas depuis un autre compte (suppression de compte,
-- remise à zéro, cascade…). Depuis l'éditeur SQL (auth.uid() nul) : permis.
create or replace function public.app_protege_pdg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role_key = 'pdg' and auth.uid() is not null and auth.uid() <> old.id then
    raise exception 'Le PDG ne peut pas être supprimé depuis un autre compte.' using errcode = '42501';
  end if;
  return old;
end $$;

drop trigger if exists profiles_protege_pdg on public.profiles;
create trigger profiles_protege_pdg before delete on public.profiles
  for each row execute function public.app_protege_pdg();

-- … ni sanctionné, quelle que soit la fonction qui s'en charge.
create or replace function public.app_protege_pdg_sanctions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and exists (select 1 from public.profiles where id = new.user_id and role_key = 'pdg')
     and auth.uid() <> new.user_id then
    raise exception 'Le PDG ne peut pas être sanctionné.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists sanctions_protege_pdg on public.sanctions;
create trigger sanctions_protege_pdg before insert on public.sanctions
  for each row execute function public.app_protege_pdg_sanctions();

-- Un code de rôle « super administrateur » ne peut être créé que par le PDG
-- (sinon un super administrateur ferait des pairs par la petite porte, 0030).
create or replace function public.app_garde_codes_de_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.role_key = 'super_admin' and not app_is_pdg() then
    raise exception 'Seul le PDG crée un code de super administrateur.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists role_codes_garde_pdg on public.role_codes;
create trigger role_codes_garde_pdg before insert on public.role_codes
  for each row execute function public.app_garde_codes_de_role();

revoke all on function public.app_garde_codes_de_role() from public, anon, authenticated;

-- Réglages du site (apparence) : le PDG aussi.
drop policy if exists site_settings_ecriture on public.site_settings;
create policy site_settings_ecriture on public.site_settings
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role_key in ('admin', 'super_admin', 'pdg')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role_key in ('admin', 'super_admin', 'pdg')));

-- L'identité Discord vérifiée peut désigner le PDG (voir 0035) : on ajoute le
-- rôle à la liste autorisée et on le préfère à tout autre.
alter table public.admins_discord drop constraint if exists admins_discord_role_key_check;
alter table public.admins_discord
  add constraint admins_discord_role_key_check check (role_key in ('admin', 'super_admin', 'pdg'));

create or replace function public.app_role_discord(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select a.role_key
    from auth.identities i
    join public.admins_discord a
      on a.discord_id = coalesce(i.provider_id, i.identity_data->>'sub')
   where i.user_id = uid and i.provider = 'discord'
   order by (select r.rank from public.roles r where r.key = a.role_key) desc nulls last
   limit 1;
$$;

revoke all on function public.app_is_pdg(), public.app_protege_pdg(), public.app_protege_pdg_sanctions()
  from public, anon, authenticated;
grant execute on function public.app_is_pdg() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Réglages : commandes ouvertes, limite de pages, réserve de départ
-- ---------------------------------------------------------------------------
delete from public.commerce_settings where key = 'payments_enabled';

insert into public.commerce_settings (key, value) values
  ('orders_open', 'true'::jsonb),     -- on peut envoyer une missive de commande
  ('max_pages',   '10'::jsonb)        -- pages par cahier personnel ; 0 = pas de limite
on conflict (key) do nothing;

-- Réserve de départ : « pas beaucoup de caractères ». On ne touche qu'à la valeur
-- d'origine de 0039 ; si vous l'aviez déjà réglée vous-même, elle reste.
update public.commerce_settings set value = '3000'::jsonb
 where key = 'starter_ink' and value = '20000'::jsonb;

-- La monnaie est celle du jeu (code de trois lettres, au choix : RBX, …).
update public.commerce_settings set value = '"RBX"'::jsonb
 where key = 'currency' and value = '"EUR"'::jsonb;
alter table public.products alter column currency set default 'RBX';

-- Le PDG n'est ni limité en encre ni en cahiers ni en pages.
update public.commerce_settings
   set value = value || '["pdg"]'::jsonb
 where key = 'exempt_roles' and not (value ? 'pdg');

-- ---------------------------------------------------------------------------
-- 3. Les commandes (la « missive »)
-- ---------------------------------------------------------------------------
-- On réutilise la table des achats : une commande est un achat EN ATTENTE, avec
-- la copie du prix et des quantités au moment où la missive est envoyée.
alter table public.purchases add column if not exists message      text;
alter table public.purchases add column if not exists decision_note text;
alter table public.purchases add column if not exists delivered_by uuid references public.profiles(id) on delete set null;
alter table public.purchases add column if not exists delivered_at timestamptz;

-- Il n'y a plus de prestataire : ces deux fonctions n'ont plus de raison d'être.
drop function if exists public.start_purchase(text);
drop function if exists public.fulfill_purchase(uuid, text, text, text, text);

-- L'élève envoie sa missive : rien n'est crédité, rien n'est payé.
create or replace function public.passer_commande(target_sku text, note text default null)
returns public.purchases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p   public.products;
  a   public.purchases;
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if coalesce(public.app_reglage('orders_open') = 'true'::jsonb, false) is not true then
    raise exception 'Les commandes sont fermées pour le moment.' using errcode = 'PA001';
  end if;

  select * into p from public.products where sku = target_sku and active;
  if p.id is null then
    raise exception 'Ce produit n''est pas en vente.' using errcode = 'PA002';
  end if;

  if note is not null and char_length(note) > 300 then
    raise exception 'Votre message est trop long (300 caractères au plus).' using errcode = '22023';
  end if;

  -- Une seule missive en attente par produit, et pas plus de trois en tout.
  if exists (select 1 from public.purchases
              where user_id = uid and product_id = p.id and status = 'pending') then
    raise exception 'Vous avez déjà une missive en attente pour ce produit.' using errcode = 'PA003';
  end if;
  if (select count(*) from public.purchases where user_id = uid and status = 'pending') >= 3 then
    raise exception 'Trop de missives en attente : attendez qu''elles soient livrées.' using errcode = 'PA003';
  end if;

  insert into public.purchases
    (user_id, product_id, product_sku, product_label, kind,
     unit_price_cents, currency, ink_units, notebook_credits, status, provider, message)
  values
    (uid, p.id, p.sku, p.label, p.kind,
     p.price_cents, p.currency, p.ink_units, p.notebook_credits, 'pending', 'roblox',
     nullif(btrim(coalesce(note, '')), ''))
  returning * into a;

  perform public.app_journaliser(uid, 'boutique.commande',
    jsonb_build_object('commande', a.id, 'produit', a.product_sku, 'prix', a.unit_price_cents));
  return a;
end $$;

-- L'élève retire sa missive tant qu'elle n'est pas livrée.
create or replace function public.annuler_commande(target uuid)
returns public.purchases
language plpgsql security definer set search_path = public as $$
declare a public.purchases;
begin
  update public.purchases
     set status = 'canceled', decision_note = 'Annulée par l''élève'
   where id = target and user_id = auth.uid() and status = 'pending'
   returning * into a;
  if a.id is null then
    raise exception 'Cette missive n''existe pas ou n''est plus en attente.' using errcode = 'P0002';
  end if;
  return a;
end $$;

-- LE geste qui crédite : le PDG a été payé en jeu et remet la commande.
-- Idempotent : une commande déjà livrée ne crédite pas deux fois.
create or replace function public.admin_livrer_commande(target uuid, note text default null)
returns public.purchases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  a   public.purchases;
begin
  if not app_has_permission('MANAGE_SHOP') then
    raise exception 'Réservé à l''administration de la boutique.' using errcode = '42501';
  end if;

  select * into a from public.purchases where id = target for update;
  if a.id is null then
    raise exception 'Commande introuvable.' using errcode = 'P0002';
  end if;
  if a.status = 'paid' then
    return a;
  end if;
  if a.status <> 'pending' then
    raise exception 'Cette commande n''est plus en attente (%).', a.status using errcode = '22023';
  end if;
  if a.user_id is null then
    raise exception 'Acheteur introuvable.' using errcode = 'P0002';
  end if;

  update public.purchases
     set status = 'paid', provider = 'roblox', paid_at = now(), fulfilled_at = now(),
         delivered_by = uid, delivered_at = now(),
         decision_note = nullif(btrim(coalesce(note, '')), '')
   where id = a.id
   returning * into a;

  perform public.app_assurer_commerce(a.user_id);

  if a.ink_units > 0 then
    update public.ink_wallets
       set granted_total = granted_total + a.ink_units, updated_at = now()
     where user_id = a.user_id;
    insert into public.ink_ledger (user_id, delta, reason, purchase_id, note, actor)
    values (a.user_id, a.ink_units, 'purchase', a.id, a.product_label, uid);
  end if;

  if a.notebook_credits > 0 then
    update public.notebook_quota
       set credits_purchased = credits_purchased + a.notebook_credits, updated_at = now()
     where user_id = a.user_id;
  end if;

  perform public.app_journaliser(uid, 'boutique.livraison',
    jsonb_build_object('commande', a.id, 'acheteur', a.user_id, 'produit', a.product_sku, 'prix', a.unit_price_cents));
  return a;
end $$;

create or replace function public.admin_refuser_commande(target uuid, note text default null)
returns public.purchases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  a   public.purchases;
begin
  if not app_has_permission('MANAGE_SHOP') then
    raise exception 'Réservé à l''administration de la boutique.' using errcode = '42501';
  end if;
  update public.purchases
     set status = 'canceled', decision_note = nullif(btrim(coalesce(note, '')), '')
   where id = target and status = 'pending'
   returning * into a;
  if a.id is null then
    raise exception 'Cette commande n''est plus en attente.' using errcode = 'P0002';
  end if;
  perform public.app_journaliser(uid, 'boutique.refus',
    jsonb_build_object('commande', a.id, 'acheteur', a.user_id, 'note', note));
  return a;
end $$;

-- La livraison se voit tout de suite chez l'élève.
do $$ begin
  alter publication supabase_realtime add table public.purchases;
exception when duplicate_object then null;
          when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Limite de pages par cahier
-- ---------------------------------------------------------------------------
create or replace function public.app_limite_pages() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  maxi int := coalesce(public.app_reglage_int('max_pages', 10), 10);
  n    int;
begin
  if auth.uid() is null or maxi <= 0 then
    return new;
  end if;
  -- Seul le cahier PERSONNEL d'un compte non exempté est limité.
  perform 1 from public.notebooks
   where id = new.notebook_id and kind = 'personal'
   for update;                                   -- sérialise deux ajouts simultanés
  if not found or public.app_exempte_encre(auth.uid()) then
    return new;
  end if;
  select count(*) into n from public.notebook_pages where notebook_id = new.notebook_id;
  if n >= maxi then
    raise exception 'Ce cahier est plein : % pages au maximum.', maxi using errcode = 'PG001';
  end if;
  return new;
end $$;

drop trigger if exists notebook_pages_limite on public.notebook_pages;
create trigger notebook_pages_limite before insert on public.notebook_pages
  for each row execute function public.app_limite_pages();

-- ---------------------------------------------------------------------------
-- 5. Ce que l'application lit, et ce que l'administration règle
-- ---------------------------------------------------------------------------
create or replace function public.mon_commerce() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  w     public.ink_wallets;
  q     public.notebook_quota;
  libre int  := coalesce(public.app_reglage_int('free_notebooks', 1), 1);
  permis int;
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  perform public.app_assurer_commerce(uid);
  select * into w from public.ink_wallets where user_id = uid;
  select * into q from public.notebook_quota where user_id = uid;
  permis := libre + q.credits_purchased + q.credits_granted;

  return jsonb_build_object(
    'exempte', public.app_exempte_encre(uid),
    'encre', jsonb_build_object('solde', w.balance, 'recu', w.granted_total, 'consomme', w.spent_total),
    'cahiers', jsonb_build_object(
      'crees', q.created_total, 'autorises', permis,
      'restants', greatest(0, permis - q.created_total)),
    'pages_max', coalesce(public.app_reglage_int('max_pages', 10), 10),
    'regles', jsonb_build_object(
      'cout_caractere', coalesce(public.app_reglage_int('char_cost', 1), 1),
      'cout_trace', coalesce(public.app_reglage_int('stroke_cost', 20), 20),
      'cout_piece', coalesce(public.app_reglage_int('attachment_cost', 500), 500)),
    'commandes_ouvertes', coalesce(public.app_reglage('orders_open') = 'true'::jsonb, false)
  );
end $$;

create or replace function public.admin_set_setting(cle text, valeur jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ok  boolean := false;
begin
  if not app_has_permission('MANAGE_SHOP') then
    raise exception 'Réservé à l''administration de la boutique.' using errcode = '42501';
  end if;

  if cle in ('free_notebooks', 'starter_ink', 'char_cost', 'stroke_cost', 'attachment_cost', 'max_pages') then
    ok := jsonb_typeof(valeur) = 'number' and valeur::text ~ '^[0-9]{1,9}$';
  elsif cle = 'orders_open' then
    ok := jsonb_typeof(valeur) = 'boolean';
  elsif cle = 'currency' then
    ok := jsonb_typeof(valeur) = 'string' and (valeur #>> '{}') ~ '^[A-Z]{3}$';
  elsif cle = 'exempt_roles' then
    ok := jsonb_typeof(valeur) = 'array'
      and not exists (
        select 1 from jsonb_array_elements_text(valeur) r
         where r not in (select key from public.roles));
  end if;
  if not ok then
    raise exception 'Réglage « % » : valeur refusée.', cle using errcode = '22023';
  end if;

  insert into public.commerce_settings (key, value, updated_at, updated_by)
  values (cle, valeur, now(), uid)
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = uid;

  perform public.app_journaliser(uid, 'boutique.reglage', jsonb_build_object('reglage', cle, 'valeur', valeur));
  return valeur;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Qui peut appeler quoi
-- ---------------------------------------------------------------------------
revoke all on function
  public.app_limite_pages(),
  public.passer_commande(text, text),
  public.annuler_commande(uuid),
  public.admin_livrer_commande(uuid, text),
  public.admin_refuser_commande(uuid, text),
  public.mon_commerce(),
  public.admin_set_setting(text, jsonb)
from public, anon, authenticated;

grant execute on function
  public.passer_commande(text, text),
  public.annuler_commande(uuid),
  public.admin_livrer_commande(uuid, text),
  public.admin_refuser_commande(uuid, text),
  public.mon_commerce(),
  public.admin_set_setting(text, jsonb)
to authenticated;
