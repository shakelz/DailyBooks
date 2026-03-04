-- DailyBooks normalized schema migration (safe + idempotent)
-- Run this in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

-- =========================================
-- 1) categories: add parent_id self-FK
-- =========================================
alter table if exists public.categories
    add column if not exists parent_id text;

do $$
begin
    if to_regclass('public.categories') is null then
        return;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'fk_categories_parent_id'
          and conrelid = 'public.categories'::regclass
    ) then
        alter table public.categories
            add constraint fk_categories_parent_id
            foreign key (parent_id) references public.categories(id) on delete set null;
    end if;
end
$$;

-- Backfill parent_id from legacy parent (supports parent = id OR parent = name per shop).
update public.categories c
set parent_id = p.id
from public.categories p
where (c.parent_id is null or c.parent_id = '')
  and coalesce(nullif(trim((to_jsonb(c) ->> 'parent')), ''), '') <> ''
  and c.shop_id = p.shop_id
  and (
      (to_jsonb(c) ->> 'parent') = p.id
      or (to_jsonb(c) ->> 'parent') = p.name
  );

create unique index if not exists uq_categories_shop_name
on public.categories(shop_id, name);

-- =========================================
-- 2) inventory: add category_id FK
-- =========================================
alter table if exists public.inventory
    add column if not exists category_id text;

do $$
begin
    if to_regclass('public.inventory') is null or to_regclass('public.categories') is null then
        return;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'fk_inventory_category_id'
          and conrelid = 'public.inventory'::regclass
    ) then
        alter table public.inventory
            add constraint fk_inventory_category_id
            foreign key (category_id) references public.categories(id) on delete set null;
    end if;
end
$$;

-- Backfill category_id from legacy inventory.category (by name inside same shop).
update public.inventory i
set category_id = c.id
from public.categories c
where coalesce(nullif(trim(i.category_id), ''), '') = ''
  and c.shop_id = i.shop_id
  and coalesce(nullif(trim(to_jsonb(i) ->> 'category'), ''), '') <> ''
  and c.name = (to_jsonb(i) ->> 'category');

create unique index if not exists uq_inventory_shop_barcode
on public.inventory(shop_id, barcode)
where barcode is not null and trim(barcode) <> '';

-- =========================================
-- 3) profiles: add useful uniqueness guards
-- =========================================
create unique index if not exists uq_profiles_shop_email
on public.profiles(shop_id, email)
where email is not null and trim(email) <> '';

create unique index if not exists uq_profiles_shop_salesman_number
on public.profiles(shop_id, salesman_number)
where salesman_number is not null;

-- =========================================
-- 4) transactions: occurred_at + worker FK
-- =========================================
alter table if exists public.transactions
    add column if not exists occurred_at timestamptz;

-- Backfill occurred_at from timestamp/date/created_at where possible.
do $$
begin
    if to_regclass('public.transactions') is null then
        return;
    end if;

    -- Prefer legacy timestamp text/column when parseable.
    update public.transactions t
    set occurred_at = nullif(trim(to_jsonb(t) ->> 'timestamp'), '')::timestamptz
    where t.occurred_at is null
      and coalesce(nullif(trim(to_jsonb(t) ->> 'timestamp'), ''), '') <> '';

    -- Fallback to legacy date text.
    update public.transactions t
    set occurred_at = case
        when (to_jsonb(t) ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$'
            then ((to_jsonb(t) ->> 'date')::date)::timestamptz
        when (to_jsonb(t) ->> 'date') ~ '^\d{2}\s+[A-Za-z]{3}\s+\d{4}$'
            then (to_date((to_jsonb(t) ->> 'date'), 'DD Mon YYYY'))::timestamptz
        else null
    end
    where t.occurred_at is null
      and coalesce(nullif(trim(to_jsonb(t) ->> 'date'), ''), '') <> '';

    -- Fallback to created_at if still null.
    update public.transactions
    set occurred_at = created_at
    where occurred_at is null and created_at is not null;

    -- Final fallback.
    update public.transactions
    set occurred_at = now()
    where occurred_at is null;
end
$$;

create index if not exists idx_transactions_shop_occurred_at
on public.transactions(shop_id, occurred_at desc);

-- Add FK for worker -> profiles (without forcing immediate validation).
do $$
begin
    if to_regclass('public.transactions') is null or to_regclass('public.profiles') is null then
        return;
    end if;

    -- Camel-case column variant
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'transactions'
          and column_name = 'workerId'
    ) and not exists (
        select 1
        from pg_constraint
        where conname = 'fk_transactions_worker_camel'
          and conrelid = 'public.transactions'::regclass
    ) then
        execute 'alter table public.transactions
                 add constraint fk_transactions_worker_camel
                 foreign key ("workerId") references public.profiles(id) on delete set null not valid';
    end if;

    -- Snake-case/lower-case variant
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'transactions'
          and column_name = 'worker_id'
    ) and not exists (
        select 1
        from pg_constraint
        where conname = 'fk_transactions_worker'
          and conrelid = 'public.transactions'::regclass
    ) then
        alter table public.transactions
            add constraint fk_transactions_worker
            foreign key (worker_id) references public.profiles(id) on delete set null not valid;
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'transactions'
          and column_name = 'workerid'
    ) and not exists (
        select 1
        from pg_constraint
        where conname = 'fk_transactions_worker_lower'
          and conrelid = 'public.transactions'::regclass
    ) then
        alter table public.transactions
            add constraint fk_transactions_worker_lower
            foreign key (workerid) references public.profiles(id) on delete set null not valid;
    end if;
end
$$;

-- =========================================
-- 5) transaction_items: normalized line items
-- =========================================
create table if not exists public.transaction_items (
    id text primary key,
    shop_id text not null references public.shops(id) on delete cascade,
    transaction_id text not null references public.transactions(id) on delete cascade,
    product_id text references public.inventory(id) on delete set null,
    qty integer not null default 1,
    unit_price numeric not null default 0,
    line_total numeric not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists idx_transaction_items_transaction
on public.transaction_items(transaction_id);

create index if not exists idx_transaction_items_product
on public.transaction_items(product_id);

-- Backfill one line-item per legacy transaction row if product reference exists.
insert into public.transaction_items (id, shop_id, transaction_id, product_id, qty, unit_price, line_total)
select
    gen_random_uuid()::text,
    t.shop_id,
    t.id,
    nullif(coalesce(to_jsonb(t) ->> 'product_id', to_jsonb(t) ->> 'productId'), ''),
    coalesce(
        nullif(coalesce(to_jsonb(t) ->> 'quantity', to_jsonb(t) ->> 'qty'), '')::integer,
        1
    ) as qty,
    coalesce(
        nullif(coalesce(to_jsonb(t) ->> 'unit_price', to_jsonb(t) ->> 'unitPrice'), '')::numeric,
        0
    ) as unit_price,
    coalesce(
        nullif(to_jsonb(t) ->> 'amount', '')::numeric,
        0
    ) as line_total
from public.transactions t
where coalesce(nullif(coalesce(to_jsonb(t) ->> 'product_id', to_jsonb(t) ->> 'productId'), ''), '') <> ''
  and not exists (
      select 1
      from public.transaction_items ti
      where ti.shop_id = t.shop_id
        and ti.transaction_id = t.id
  );

-- =========================================
-- 6) repairs: created_at/delivery_at + repair_parts
-- =========================================
alter table if exists public.repairs
    add column if not exists created_at timestamptz default now(),
    add column if not exists completed_at timestamptz,
    add column if not exists delivery_at date;

-- Backfill created_at and delivery_at from legacy fields.
update public.repairs r
set created_at = coalesce(
        r.created_at,
        nullif(trim(to_jsonb(r) ->> 'createdAt'), '')::timestamptz,
        nullif(trim(to_jsonb(r) ->> 'timestamp'), '')::timestamptz,
        now()
    )
where r.created_at is null;

update public.repairs r
set completed_at = nullif(trim(to_jsonb(r) ->> 'completedAt'), '')::timestamptz
where r.completed_at is null
  and coalesce(nullif(trim(to_jsonb(r) ->> 'completedAt'), ''), '') <> '';

update public.repairs r
set delivery_at = case
    when (to_jsonb(r) ->> 'deliveryDate') ~ '^\d{4}-\d{2}-\d{2}$'
        then (to_jsonb(r) ->> 'deliveryDate')::date
    else r.delivery_at
end
where r.delivery_at is null
  and coalesce(nullif(trim(to_jsonb(r) ->> 'deliveryDate'), ''), '') <> '';

create table if not exists public.repair_parts (
    id text primary key,
    shop_id text not null references public.shops(id) on delete cascade,
    repair_id text not null references public.repairs(id) on delete cascade,
    product_id text references public.inventory(id) on delete set null,
    name text,
    qty numeric not null default 1,
    price numeric not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists idx_repair_parts_repair
on public.repair_parts(repair_id);

-- Backfill repair_parts from legacy repairs.partsUsed JSONB, if present.
insert into public.repair_parts (id, shop_id, repair_id, product_id, name, qty, price)
select
    gen_random_uuid()::text,
    r.shop_id,
    r.id,
    nullif(coalesce(p ->> 'product_id', p ->> 'productId'), ''),
    nullif(p ->> 'name', ''),
    coalesce(nullif(coalesce(p ->> 'qty', p ->> 'quantity'), '')::numeric, 1),
    coalesce(nullif(coalesce(p ->> 'price', p ->> 'costPrice'), '')::numeric, 0)
from public.repairs r
cross join lateral jsonb_array_elements(
    case
        when jsonb_typeof(to_jsonb(r) -> 'partsUsed') = 'array' then (to_jsonb(r) -> 'partsUsed')
        else '[]'::jsonb
    end
) as p
where not exists (
    select 1
    from public.repair_parts rp
    where rp.shop_id = r.shop_id
      and rp.repair_id = r.id
);

commit;

-- Optional cleanup after frontend is fully switched:
-- alter table public.categories drop column if exists parent;
-- alter table public.inventory drop column if exists category;
-- alter table public.transactions drop column if exists date;
-- alter table public.transactions drop column if exists time;
-- alter table public.transactions drop column if exists "salesmanName";
-- alter table public.transactions drop column if exists "productId";
-- alter table public.transactions drop column if exists quantity;
-- alter table public.repairs drop column if exists "partsUsed";
-- alter table public.repairs drop column if exists "deliveryDate";
-- alter table public.repairs drop column if exists "createdAt";
