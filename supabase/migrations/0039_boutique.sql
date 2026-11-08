-- ============================================================================
-- 0039 — La boutique : l'encre et les cahiers supplémentaires.
--
-- Deux règles commerciales, appliquées PAR LA BASE (jamais par le navigateur) :
--
--   1. L'ENCRE. Chaque compte a une réserve. Tout contenu produit (texte d'un
--      cahier, pense-bête, tracé au tableau, pièce jointe) la fait baisser.
--      Réserve épuisée : la base REFUSE les nouvelles écritures. Elle ne
--      touche à rien de ce qui est déjà écrit : lire reste toujours possible.
--
--   2. LES CAHIERS. Le premier cahier personnel est gratuit, les suivants
--      s'achètent. Le droit de créer se mesure sur le nombre de cahiers JAMAIS
--      créés, pas sur le nombre de cahiers existants : supprimer un cahier ne
--      rend ni remboursement ni cahier gratuit.
--
-- Ce que le navigateur ne peut PAS faire, quel que soit le code qu'il exécute :
--   · écrire dans ink_wallets, notebook_quota, products, purchases ou
--     commerce_settings (aucune politique d'écriture, droits retirés) ;
--   · créditer de l'encre ou un cahier : seule fulfill_purchase() le fait, et
--     elle n'est appelable que par le rôle de service (le webhook du prestataire
--     de paiement, après vérification de sa signature) ;
--   · choisir un prix : start_purchase() relit le prix en base, et l'achat
--     enregistre une COPIE du prix et des quantités. Changer un tarif ne
--     modifie donc jamais un achat déjà fait.
--
-- NOTE : le paiement se fait finalement EN JEU, pas sur le site. La migration
-- 0041 supprime start_purchase() et fulfill_purchase() (prévues pour un
-- prestataire de paiement) et les remplace par des commandes par missive que le
-- PDG livre à la main. Voir docs/COMMANDES.md.
--
-- Cette migration n'efface ni ne modifie aucune donnée existante : elle ajoute
-- des tables, des fonctions et des déclencheurs, puis crée un portefeuille et
-- un compteur de cahiers pour chaque compte déjà présent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Réglages (modifiables par l'administration, sans toucher au code)
-- ---------------------------------------------------------------------------
create table if not exists public.commerce_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.commerce_settings (key, value) values
  ('free_notebooks',   '1'::jsonb),        -- cahiers personnels offerts à chaque compte
  ('starter_ink',      '20000'::jsonb),    -- réserve offerte à la création du compte
  ('char_cost',        '1'::jsonb),        -- encre par caractère écrit
  ('stroke_cost',      '20'::jsonb),       -- encre par tracé au tableau
  ('attachment_cost',  '500'::jsonb),      -- encre par pièce jointe ou image
  ('exempt_roles',     '["super_admin","admin","director","teacher","instructor"]'::jsonb),
  ('payments_enabled', 'false'::jsonb),    -- NE PASSE À true QU'UNE FOIS LE PRESTATAIRE BRANCHÉ
  ('currency',         '"EUR"'::jsonb)
on conflict (key) do nothing;

create or replace function public.app_reglage(cle text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.commerce_settings where key = cle
$$;

create or replace function public.app_reglage_int(cle text, defaut int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.commerce_settings where key = cle), defaut)
$$;

-- Les rôles dispensés d'encre et de quota de cahiers (administration, professeurs).
create or replace function public.app_exempte_encre(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = uid
       and coalesce(public.app_reglage('exempt_roles'), '[]'::jsonb) ? p.role_key
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. Les produits et leur historique de prix
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  sku              text not null unique check (sku ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  kind             text not null check (kind in ('ink_cartridge', 'notebook')),
  label            text not null check (length(btrim(label)) between 1 and 80),
  description      text,
  price_cents      int  not null check (price_cents > 0),
  currency         text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  ink_units        bigint not null default 0 check (ink_units >= 0),
  notebook_credits int  not null default 0 check (notebook_credits >= 0),
  active           boolean not null default false,
  sort             int  not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles(id) on delete set null,
  constraint products_contenu check (
    (kind = 'ink_cartridge' and ink_units > 0 and notebook_credits = 0)
    or (kind = 'notebook' and notebook_credits > 0 and ink_units = 0)
  )
);

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create table if not exists public.product_price_history (
  id                   bigint generated always as identity primary key,
  product_id           uuid references public.products(id) on delete set null,
  product_sku          text not null,
  operation            text not null check (operation in ('create', 'update')),
  old_price_cents      int,
  new_price_cents      int,
  old_ink_units        bigint,
  new_ink_units        bigint,
  old_notebook_credits int,
  new_notebook_credits int,
  old_active           boolean,
  new_active           boolean,
  changed_by           uuid references public.profiles(id) on delete set null,
  changed_at           timestamptz not null default now()
);
create index if not exists product_price_history_idx
  on public.product_price_history (product_id, changed_at desc);

-- Chaque changement de prix, de quantité ou d'état est inscrit, avec la date et
-- l'administrateur responsable. Le déclencheur ne dépend pas de l'application :
-- même une modification faite à la main dans la base laisse sa trace.
create or replace function public.app_historique_produit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.product_price_history
      (product_id, product_sku, operation, new_price_cents, new_ink_units,
       new_notebook_credits, new_active, changed_by)
    values (new.id, new.sku, 'create', new.price_cents, new.ink_units,
            new.notebook_credits, new.active, auth.uid());
  elsif new.price_cents is distinct from old.price_cents
     or new.ink_units is distinct from old.ink_units
     or new.notebook_credits is distinct from old.notebook_credits
     or new.active is distinct from old.active then
    insert into public.product_price_history
      (product_id, product_sku, operation,
       old_price_cents, new_price_cents, old_ink_units, new_ink_units,
       old_notebook_credits, new_notebook_credits, old_active, new_active, changed_by)
    values (new.id, new.sku, 'update',
            old.price_cents, new.price_cents, old.ink_units, new.ink_units,
            old.notebook_credits, new.notebook_credits, old.active, new.active, auth.uid());
  end if;
  return null;
end $$;

drop trigger if exists products_historique on public.products;
create trigger products_historique after insert or update on public.products
  for each row execute function public.app_historique_produit();

-- ---------------------------------------------------------------------------
-- 3. Les achats : une copie figée du prix et des quantités au moment de l'achat
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles(id) on delete set null,
  product_id          uuid references public.products(id) on delete set null,
  product_sku         text not null,
  product_label       text not null,
  kind                text not null check (kind in ('ink_cartridge', 'notebook')),
  unit_price_cents    int  not null check (unit_price_cents > 0),
  currency            text not null,
  ink_units           bigint not null default 0,
  notebook_credits    int  not null default 0,
  status              text not null default 'pending'
                        check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  provider            text,
  provider_session_id text,
  provider_payment_id text,
  provider_event_id   text,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  fulfilled_at        timestamptz
);
create index if not exists purchases_user_idx on public.purchases (user_id, created_at desc);
-- Un même paiement, un même événement du prestataire : une seule fois.
create unique index if not exists purchases_session_uniq
  on public.purchases (provider, provider_session_id) where provider_session_id is not null;
create unique index if not exists purchases_event_uniq
  on public.purchases (provider, provider_event_id) where provider_event_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Le portefeuille d'encre, le journal et le compteur de cahiers
-- ---------------------------------------------------------------------------
-- balance est CALCULÉE : reçu - consommé. Elle ne peut pas dériver, et la
-- contrainte l'empêche de passer sous zéro même si une fonction se trompait.
create table if not exists public.ink_wallets (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  granted_total bigint not null default 0 check (granted_total >= 0),
  spent_total   bigint not null default 0 check (spent_total >= 0),
  balance       bigint generated always as (granted_total - spent_total) stored,
  updated_at    timestamptz not null default now(),
  constraint ink_wallets_jamais_negatif check (granted_total - spent_total >= 0)
);

-- Le journal ne reçoit que les ENTRÉES et les corrections (réserve de départ,
-- achats, gestes de l'administration). La consommation, qui se produit à chaque
-- sauvegarde, n'y est pas inscrite ligne à ligne : elle s'additionne dans
-- spent_total.
create table if not exists public.ink_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete set null,
  delta       bigint not null,
  reason      text not null check (reason in ('starter', 'purchase', 'admin_grant', 'admin_adjust', 'refund')),
  purchase_id uuid references public.purchases(id) on delete set null,
  note        text,
  actor       uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists ink_ledger_user_idx on public.ink_ledger (user_id, created_at desc);

create table if not exists public.notebook_quota (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  created_total     int not null default 0 check (created_total >= 0),   -- cahiers JAMAIS créés
  credits_purchased int not null default 0 check (credits_purchased >= 0),
  credits_granted   int not null default 0 check (credits_granted >= 0),  -- reprise de l'existant, gestes admin
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Sécurité des tables : lecture seulement, jamais d'écriture depuis le client
-- ---------------------------------------------------------------------------
alter table public.commerce_settings      enable row level security;
alter table public.products               enable row level security;
alter table public.product_price_history  enable row level security;
alter table public.purchases              enable row level security;
alter table public.ink_wallets            enable row level security;
alter table public.ink_ledger             enable row level security;
alter table public.notebook_quota         enable row level security;

drop policy if exists commerce_settings_read on public.commerce_settings;
create policy commerce_settings_read on public.commerce_settings
  for select to authenticated using (true);

drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select to authenticated using (active or app_has_permission('MANAGE_SHOP'));

drop policy if exists price_history_read on public.product_price_history;
create policy price_history_read on public.product_price_history
  for select to authenticated using (app_has_permission('MANAGE_SHOP'));

drop policy if exists purchases_read on public.purchases;
create policy purchases_read on public.purchases
  for select to authenticated using (user_id = auth.uid() or app_has_permission('MANAGE_SHOP'));

drop policy if exists ink_wallets_read on public.ink_wallets;
create policy ink_wallets_read on public.ink_wallets
  for select to authenticated using (user_id = auth.uid() or app_has_permission('MANAGE_SHOP'));

drop policy if exists ink_ledger_read on public.ink_ledger;
create policy ink_ledger_read on public.ink_ledger
  for select to authenticated using (user_id = auth.uid() or app_has_permission('MANAGE_SHOP'));

drop policy if exists notebook_quota_read on public.notebook_quota;
create policy notebook_quota_read on public.notebook_quota
  for select to authenticated using (user_id = auth.uid() or app_has_permission('MANAGE_SHOP'));

-- Ceinture ET bretelles : sans politique d'écriture la RLS refuse déjà, mais on
-- retire aussi les droits, au cas où quelqu'un ajouterait une politique un jour.
revoke all on public.commerce_settings, public.products, public.product_price_history,
              public.purchases, public.ink_wallets, public.ink_ledger, public.notebook_quota
  from anon;
revoke insert, update, delete, truncate on
  public.commerce_settings, public.products, public.product_price_history,
  public.purchases, public.ink_wallets, public.ink_ledger, public.notebook_quota
  from authenticated;

-- L'encre restante se met à jour en direct sur l'écran de son propriétaire
-- (achat confirmé par le prestataire, geste de l'administration).
do $$ begin
  alter publication supabase_realtime add table public.ink_wallets;
exception when duplicate_object then null;
          when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Permission : seule l'administration règle la boutique
-- ---------------------------------------------------------------------------
insert into public.permissions (key, label, category) values
  ('MANAGE_SHOP', 'Régler la boutique (prix, encre, cahiers)', 'administration')
on conflict (key) do update set label = excluded.label, category = excluded.category;

insert into public.role_permissions (role_key, permission_key)
select r.key, 'MANAGE_SHOP' from public.roles r where r.key in ('super_admin', 'admin')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 7. Le portefeuille et le compteur de chaque compte
-- ---------------------------------------------------------------------------
create or replace function public.app_assurer_commerce(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  neuf int;
  depart int;
begin
  if uid is null then return; end if;

  insert into public.ink_wallets (user_id) values (uid) on conflict (user_id) do nothing;
  get diagnostics neuf = row_count;
  if neuf = 1 then
    depart := coalesce(public.app_reglage_int('starter_ink', 0), 0);
    if depart > 0 then
      update public.ink_wallets
         set granted_total = granted_total + depart, updated_at = now()
       where user_id = uid;
      insert into public.ink_ledger (user_id, delta, reason, note)
      values (uid, depart, 'starter', 'Réserve offerte à la création du compte');
    end if;
  end if;

  insert into public.notebook_quota (user_id) values (uid) on conflict (user_id) do nothing;
end $$;

create or replace function public.app_commerce_nouveau_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.app_assurer_commerce(new.id);
  return null;
end $$;

drop trigger if exists profiles_commerce on public.profiles;
create trigger profiles_commerce after insert on public.profiles
  for each row execute function public.app_commerce_nouveau_profil();

-- Les comptes déjà là. Aucun n'est pénalisé :
--   · chacun reçoit la réserve de départ (sinon il ne pourrait plus écrire) ;
--   · ses cahiers existants comptent comme créés ET comme couverts : il les
--     garde tous, et seuls les NOUVEAUX cahiers demandent un achat.
insert into public.ink_wallets (user_id, granted_total)
select p.id, coalesce(public.app_reglage_int('starter_ink', 0), 0)
  from public.profiles p
on conflict (user_id) do nothing;

insert into public.ink_ledger (user_id, delta, reason, note)
select w.user_id, w.granted_total, 'starter', 'Réserve initiale (reprise des comptes existants)'
  from public.ink_wallets w
 where w.granted_total > 0
   and not exists (select 1 from public.ink_ledger l where l.user_id = w.user_id and l.reason = 'starter');

insert into public.notebook_quota (user_id, created_total, credits_granted)
select p.id,
       count(n.id)::int,
       greatest(0, count(n.id)::int - coalesce(public.app_reglage_int('free_notebooks', 1), 1))
  from public.profiles p
  left join public.notebooks n on n.owner_id = p.id and n.kind = 'personal'
 group by p.id
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Débiter l'encre
-- ---------------------------------------------------------------------------
-- Ce qui compte comme « du texte » : le contenu sans balises, une entité
-- (&nbsp;…) valant un caractère. Le navigateur applique la même mesure pour
-- prévenir, mais c'est cette fonction qui fait foi.
create or replace function public.app_mesure_texte(t text) returns int
language sql immutable set search_path = public as $$
  select coalesce(length(
    regexp_replace(regexp_replace(coalesce(t, ''), '<[^>]*>', '', 'g'), '&[a-zA-Z0-9#]{2,8};', ' ', 'g')
  ), 0)
$$;

-- Une image collée dans le texte est une balise <img> : le texte seul ne la voit
-- pas. On la compte à part, au prix d'une pièce jointe.
create or replace function public.app_nb_images(t text) returns int
language sql immutable set search_path = public as $$
  select (length(lower(coalesce(t, ''))) - length(replace(lower(coalesce(t, '')), '<img', ''))) / 4
$$;

create or replace function public.app_nb_elements(j jsonb) returns int
language sql immutable set search_path = public as $$
  select case when j is not null and jsonb_typeof(j) = 'array' then jsonb_array_length(j) else 0 end
$$;

create or replace function public.app_debiter_encre(uid uuid, cout bigint) returns void
language plpgsql security definer set search_path = public as $$
declare w public.ink_wallets;
begin
  if uid is null or cout is null or cout <= 0 then return; end if;
  if public.app_exempte_encre(uid) then return; end if;

  perform public.app_assurer_commerce(uid);
  select * into w from public.ink_wallets where user_id = uid for update;

  if w.balance < cout then
    raise exception 'Encre épuisée : il reste % et cette écriture en demande %.', w.balance, cout
      using errcode = 'IK001';
  end if;

  update public.ink_wallets
     set spent_total = spent_total + cout, updated_at = now()
   where user_id = uid;
end $$;

-- Les pages d'un cahier : on ne facture que ce qui S'AJOUTE. Effacer ne rend
-- rien, retaper coûte à nouveau. auth.uid() nul = le serveur lui-même
-- (migration, fonction interne) : jamais de débit.
create or replace function public.app_encre_pages() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  qui     uuid := auth.uid();
  c_car   int  := coalesce(public.app_reglage_int('char_cost', 1), 1);
  c_piece int  := coalesce(public.app_reglage_int('attachment_cost', 500), 500);
  cout    bigint;
begin
  if qui is null then return new; end if;

  if tg_op = 'INSERT' then
    cout := public.app_mesure_texte(new.body)::bigint * c_car
          + (public.app_nb_elements(new.attachments) + public.app_nb_images(new.body))::bigint * c_piece;
  else
    cout := greatest(0, public.app_mesure_texte(new.body) - public.app_mesure_texte(old.body))::bigint * c_car
          + greatest(0, (public.app_nb_elements(new.attachments) + public.app_nb_images(new.body))
                      - (public.app_nb_elements(old.attachments) + public.app_nb_images(old.body)))::bigint * c_piece;
  end if;

  perform public.app_debiter_encre(qui, cout);
  return new;
end $$;

drop trigger if exists notebook_pages_encre on public.notebook_pages;
create trigger notebook_pages_encre before insert or update of body, attachments on public.notebook_pages
  for each row execute function public.app_encre_pages();

-- Les pense-bêtes posés sur une page.
create or replace function public.app_encre_pensebetes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  qui   uuid := auth.uid();
  c_car int  := coalesce(public.app_reglage_int('char_cost', 1), 1);
  cout  bigint;
begin
  if qui is null then return new; end if;
  if tg_op = 'INSERT' then
    cout := public.app_mesure_texte(new.body)::bigint * c_car;
  else
    cout := greatest(0, public.app_mesure_texte(new.body) - public.app_mesure_texte(old.body))::bigint * c_car;
  end if;
  perform public.app_debiter_encre(qui, cout);
  return new;
end $$;

drop trigger if exists sticky_notes_encre on public.sticky_notes;
create trigger sticky_notes_encre before insert or update of body on public.sticky_notes
  for each row execute function public.app_encre_pensebetes();

-- Les tracés au tableau : chaque élément ajouté coûte. Effacer (deleted = true)
-- est une modification, pas une insertion : cela ne coûte rien et ne rend rien.
create or replace function public.app_encre_tableau() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  qui     uuid := auth.uid();
  c_car   int  := coalesce(public.app_reglage_int('char_cost', 1), 1);
  c_trait int  := coalesce(public.app_reglage_int('stroke_cost', 20), 20);
  c_piece int  := coalesce(public.app_reglage_int('attachment_cost', 500), 500);
  cout    bigint;
begin
  if qui is null then return new; end if;
  cout := case new.kind
            when 'texte' then length(coalesce(new.data->>'texte', ''))::bigint * c_car
            when 'image' then c_piece
            else c_trait
          end;
  perform public.app_debiter_encre(qui, cout);
  return new;
end $$;

drop trigger if exists board_elements_encre on public.board_elements;
create trigger board_elements_encre before insert on public.board_elements
  for each row execute function public.app_encre_tableau();

-- ---------------------------------------------------------------------------
-- 9. Créer un cahier : le premier est gratuit, les suivants s'achètent
-- ---------------------------------------------------------------------------
create or replace function public.app_quota_cahiers() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  q       public.notebook_quota;
  permis  int;
begin
  -- Seuls comptent les cahiers PERSONNELS. Un cahier de classe est créé par
  -- l'encadrement pour la classe : ce n'est pas l'achat d'un élève.
  if new.kind <> 'personal' or new.owner_id is null then return new; end if;
  if auth.uid() is null then return new; end if;

  perform public.app_assurer_commerce(new.owner_id);
  select * into q from public.notebook_quota where user_id = new.owner_id for update;

  permis := coalesce(public.app_reglage_int('free_notebooks', 1), 1)
          + q.credits_purchased + q.credits_granted;

  if q.created_total >= permis and not public.app_exempte_encre(new.owner_id) then
    raise exception 'Un cahier supplémentaire s''achète : % cahier(s) déjà créé(s), % autorisé(s).',
      q.created_total, permis using errcode = 'NB001';
  end if;

  update public.notebook_quota
     set created_total = created_total + 1, updated_at = now()
   where user_id = new.owner_id;
  return new;
end $$;

drop trigger if exists notebooks_quota on public.notebooks;
create trigger notebooks_quota before insert on public.notebooks
  for each row execute function public.app_quota_cahiers();

-- ---------------------------------------------------------------------------
-- 10. Ce que l'application lit
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
    'regles', jsonb_build_object(
      'cout_caractere', coalesce(public.app_reglage_int('char_cost', 1), 1),
      'cout_trace', coalesce(public.app_reglage_int('stroke_cost', 20), 20),
      'cout_piece', coalesce(public.app_reglage_int('attachment_cost', 500), 500)),
    'paiements_ouverts', coalesce(public.app_reglage('payments_enabled') = 'true'::jsonb, false)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 11. Acheter
-- ---------------------------------------------------------------------------
-- Ne crée qu'un achat EN ATTENTE, avec le prix lu ICI, en base. Rien n'est
-- crédité. L'encre ou le cahier n'arrive que par fulfill_purchase().
create or replace function public.start_purchase(target_sku text) returns public.purchases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p   public.products;
  a   public.purchases;
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if coalesce(public.app_reglage('payments_enabled') = 'true'::jsonb, false) is not true then
    raise exception 'Les achats ne sont pas encore ouverts.' using errcode = 'PA001';
  end if;

  select * into p from public.products where sku = target_sku and active;
  if p.id is null then
    raise exception 'Ce produit n''est pas en vente.' using errcode = 'PA002';
  end if;

  -- Pas de pluie d'achats en attente.
  if (select count(*) from public.purchases
       where user_id = uid and status = 'pending' and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop d''achats en attente : terminez ou patientez une heure.' using errcode = 'PA003';
  end if;

  insert into public.purchases
    (user_id, product_id, product_sku, product_label, kind,
     unit_price_cents, currency, ink_units, notebook_credits, status)
  values
    (uid, p.id, p.sku, p.label, p.kind,
     p.price_cents, p.currency, p.ink_units, p.notebook_credits, 'pending')
  returning * into a;
  return a;
end $$;

-- Créditer un achat payé. APPELABLE UNIQUEMENT PAR LE RÔLE DE SERVICE : c'est
-- le webhook du prestataire, après avoir vérifié sa signature, qui l'appelle.
-- Idempotente : le même achat rejoué ne crédite pas deux fois.
create or replace function public.fulfill_purchase(
  target_purchase uuid, p_provider text, p_session text, p_payment text, p_event text
) returns public.purchases
language plpgsql security definer set search_path = public as $$
declare a public.purchases;
begin
  select * into a from public.purchases where id = target_purchase for update;
  if a.id is null then
    raise exception 'Achat introuvable.' using errcode = 'P0002';
  end if;
  if a.status = 'paid' then
    return a;
  end if;
  if a.status <> 'pending' then
    raise exception 'Cet achat n''est plus en attente (%).', a.status using errcode = '42501';
  end if;
  if a.user_id is null then
    raise exception 'Acheteur introuvable.' using errcode = 'P0002';
  end if;

  update public.purchases
     set status = 'paid', provider = p_provider,
         provider_session_id = coalesce(p_session, provider_session_id),
         provider_payment_id = p_payment, provider_event_id = p_event,
         paid_at = now(), fulfilled_at = now()
   where id = a.id
   returning * into a;

  perform public.app_assurer_commerce(a.user_id);

  if a.ink_units > 0 then
    update public.ink_wallets
       set granted_total = granted_total + a.ink_units, updated_at = now()
     where user_id = a.user_id;
    insert into public.ink_ledger (user_id, delta, reason, purchase_id, note)
    values (a.user_id, a.ink_units, 'purchase', a.id, a.product_label);
  end if;

  if a.notebook_credits > 0 then
    update public.notebook_quota
       set credits_purchased = credits_purchased + a.notebook_credits, updated_at = now()
     where user_id = a.user_id;
  end if;

  perform public.app_journaliser(a.user_id, 'boutique.achat',
    jsonb_build_object('achat', a.id, 'produit', a.product_sku, 'montant_cents', a.unit_price_cents));
  return a;
end $$;

-- ---------------------------------------------------------------------------
-- 12. L'administration de la boutique (permission MANAGE_SHOP, vérifiée ici)
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_product(donnees jsonb) returns public.products
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pid uuid := nullif(donnees->>'id', '')::uuid;
  p   public.products;
begin
  if not app_has_permission('MANAGE_SHOP') then
    raise exception 'Réservé à l''administration de la boutique.' using errcode = '42501';
  end if;

  if pid is null then
    insert into public.products
      (sku, kind, label, description, price_cents, currency,
       ink_units, notebook_credits, active, sort, updated_by)
    values
      (lower(btrim(donnees->>'sku')), donnees->>'kind', btrim(donnees->>'label'),
       nullif(btrim(coalesce(donnees->>'description', '')), ''),
       (donnees->>'price_cents')::int,
       coalesce(nullif(donnees->>'currency', ''), coalesce(public.app_reglage('currency') #>> '{}', 'EUR')),
       coalesce((donnees->>'ink_units')::bigint, 0),
       coalesce((donnees->>'notebook_credits')::int, 0),
       coalesce((donnees->>'active')::boolean, false),
       coalesce((donnees->>'sort')::int, 0), uid)
    returning * into p;
  else
    -- Le SKU et le genre ne changent jamais : les achats passés s'y réfèrent.
    update public.products set
      label            = case when donnees ? 'label' then btrim(donnees->>'label') else label end,
      description      = case when donnees ? 'description'
                              then nullif(btrim(coalesce(donnees->>'description', '')), '') else description end,
      price_cents      = case when donnees ? 'price_cents' then (donnees->>'price_cents')::int else price_cents end,
      ink_units        = case when donnees ? 'ink_units' then (donnees->>'ink_units')::bigint else ink_units end,
      notebook_credits = case when donnees ? 'notebook_credits' then (donnees->>'notebook_credits')::int else notebook_credits end,
      active           = case when donnees ? 'active' then (donnees->>'active')::boolean else active end,
      sort             = case when donnees ? 'sort' then (donnees->>'sort')::int else sort end,
      updated_by       = uid
    where id = pid
    returning * into p;
    if p.id is null then
      raise exception 'Produit introuvable.' using errcode = 'P0002';
    end if;
  end if;

  perform public.app_journaliser(uid, 'boutique.produit',
    jsonb_build_object('produit', p.sku, 'prix_cents', p.price_cents, 'actif', p.active));
  return p;
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

  if cle in ('free_notebooks', 'starter_ink', 'char_cost', 'stroke_cost', 'attachment_cost') then
    ok := jsonb_typeof(valeur) = 'number' and valeur::text ~ '^[0-9]{1,9}$';
  elsif cle = 'payments_enabled' then
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

-- Donner (montant > 0) ou retirer (montant < 0) de l'encre. Jamais sous ce qui
-- a déjà été consommé : la base n'accepte pas un solde négatif.
create or replace function public.admin_grant_ink(cible uuid, montant bigint, note text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  w   public.ink_wallets;
begin
  if not app_has_permission('MANAGE_SHOP') then
    raise exception 'Réservé à l''administration de la boutique.' using errcode = '42501';
  end if;
  if montant is null or montant = 0 then
    raise exception 'Montant nul.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = cible) then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;

  perform public.app_assurer_commerce(cible);
  select * into w from public.ink_wallets where user_id = cible for update;
  if w.balance + montant < 0 then
    raise exception 'Impossible : il ne reste que % d''encre à ce compte.', w.balance using errcode = '22023';
  end if;

  update public.ink_wallets
     set granted_total = granted_total + montant, updated_at = now()
   where user_id = cible;
  insert into public.ink_ledger (user_id, delta, reason, note, actor)
  values (cible, montant, case when montant > 0 then 'admin_grant' else 'admin_adjust' end, note, uid);

  perform public.app_journaliser(uid, 'boutique.encre',
    jsonb_build_object('cible', cible, 'montant', montant, 'note', note));
  return w.balance + montant;
end $$;

create or replace function public.admin_grant_notebooks(cible uuid, nombre int, note text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q   public.notebook_quota;
begin
  if not app_has_permission('MANAGE_SHOP') then
    raise exception 'Réservé à l''administration de la boutique.' using errcode = '42501';
  end if;
  if nombre is null or nombre = 0 then
    raise exception 'Nombre nul.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = cible) then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;

  perform public.app_assurer_commerce(cible);
  select * into q from public.notebook_quota where user_id = cible for update;
  if q.credits_granted + nombre < 0 then
    raise exception 'Impossible : ce compte n''a que % cahier(s) offert(s).', q.credits_granted using errcode = '22023';
  end if;

  update public.notebook_quota
     set credits_granted = credits_granted + nombre, updated_at = now()
   where user_id = cible;

  perform public.app_journaliser(uid, 'boutique.cahiers',
    jsonb_build_object('cible', cible, 'nombre', nombre, 'note', note));
  return q.credits_granted + nombre;
end $$;

-- Le tableau de l'administration : un compte par ligne.
create or replace function public.admin_commerce_overview(recherche text default null, limite int default 200)
returns table (
  o_user_id uuid, o_nom text, o_role text,
  o_solde bigint, o_recu bigint, o_consomme bigint,
  o_cahiers_possedes int, o_cahiers_crees int, o_cahiers_autorises int,
  o_achats int, o_paye_cents bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app_has_permission('MANAGE_SHOP') then
    raise exception 'Réservé à l''administration de la boutique.' using errcode = '42501';
  end if;

  return query
  select p.id, p.display_name, p.role_key,
         coalesce(w.balance, 0), coalesce(w.granted_total, 0), coalesce(w.spent_total, 0),
         (select count(*)::int from public.notebooks n where n.owner_id = p.id and n.kind = 'personal'),
         coalesce(q.created_total, 0),
         coalesce(public.app_reglage_int('free_notebooks', 1), 1)
           + coalesce(q.credits_purchased, 0) + coalesce(q.credits_granted, 0),
         (select count(*)::int from public.purchases a where a.user_id = p.id and a.status = 'paid'),
         coalesce((select sum(a.unit_price_cents) from public.purchases a
                    where a.user_id = p.id and a.status = 'paid'), 0)::bigint
    from public.profiles p
    left join public.ink_wallets w on w.user_id = p.id
    left join public.notebook_quota q on q.user_id = p.id
   where recherche is null or btrim(recherche) = ''
      or p.display_name ilike '%' || replace(replace(btrim(recherche), '%', ''), '_', '') || '%'
   order by p.display_name
   limit least(greatest(coalesce(limite, 200), 1), 1000);
end $$;

-- ---------------------------------------------------------------------------
-- 13. Qui peut appeler quoi
--
-- Toute fonction créée par défaut est exécutable par tout le monde. On retire
-- d'abord tout, puis on rouvre exactement ce qui doit l'être.
-- ---------------------------------------------------------------------------
revoke all on function
  public.app_reglage(text),
  public.app_reglage_int(text, int),
  public.app_exempte_encre(uuid),
  public.app_historique_produit(),
  public.app_assurer_commerce(uuid),
  public.app_commerce_nouveau_profil(),
  public.app_mesure_texte(text),
  public.app_nb_elements(jsonb),
  public.app_nb_images(text),
  public.app_debiter_encre(uuid, bigint),
  public.app_encre_pages(),
  public.app_encre_pensebetes(),
  public.app_encre_tableau(),
  public.app_quota_cahiers(),
  public.mon_commerce(),
  public.start_purchase(text),
  public.fulfill_purchase(uuid, text, text, text, text),
  public.admin_save_product(jsonb),
  public.admin_set_setting(text, jsonb),
  public.admin_grant_ink(uuid, bigint, text),
  public.admin_grant_notebooks(uuid, int, text),
  public.admin_commerce_overview(text, int)
from public, anon, authenticated;

grant execute on function
  public.mon_commerce(),
  public.start_purchase(text),
  public.admin_save_product(jsonb),
  public.admin_set_setting(text, jsonb),
  public.admin_grant_ink(uuid, bigint, text),
  public.admin_grant_notebooks(uuid, int, text),
  public.admin_commerce_overview(text, int)
to authenticated;

-- Le seul créditeur : le rôle de service (webhook du prestataire de paiement).
grant execute on function public.fulfill_purchase(uuid, text, text, text, text) to service_role;
