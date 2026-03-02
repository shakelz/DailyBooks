-- ==============================================================================
-- DailyBooks ERP - Supabase PostgreSQL Schema (Vercel + Supabase)
-- ==============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------------------
-- Shared helper: auto-update updated_at
-- ------------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------------------------
-- shops
-- ------------------------------------------------------------------------------
create table if not exists public.shops (
    id text primary key,
    name text not null,
    location text,
    address text,
    owner_email text,
    password text,
    telephone text,
    bill_show_tax boolean default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists trg_shops_updated_at on public.shops;
create trigger trg_shops_updated_at
before update on public.shops
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------------------------
create table if not exists public.profiles (
    id text primary key,
    shop_id text references public.shops(id) on delete cascade,
    name text not null,
    email text,
    password text,
    pin text,
    passcode text,
    pin_code text,
    pass_code text,
    role text not null default 'salesman',
    active boolean not null default true,
    is_online boolean not null default false,
    "hourlyRate" numeric default 12.5,
    salesman_number integer,
    can_edit_transactions boolean not null default false,
    can_bulk_edit boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_shop_id on public.profiles(shop_id);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_email on public.profiles(email);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------
-- categories
-- ------------------------------------------------------------------------------
create table if not exists public.categories (
    id text primary key,
    shop_id text references public.shops(id) on delete cascade,
    name text not null,
    parent text,
    image text,
    level integer,
    timestamp timestamptz default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_categories_shop_id on public.categories(shop_id);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------
-- inventory
-- ------------------------------------------------------------------------------
create table if not exists public.inventory (
    id text primary key,
    shop_id text references public.shops(id) on delete cascade,
    name text not null,
    "purchasePrice" numeric default 0,
    "sellingPrice" numeric default 0,
    stock integer default 0,
    category text,
    barcode text,
    "productUrl" text,
    "attributes" jsonb default '{}'::jsonb,
    timestamp timestamptz default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_shop_id on public.inventory(shop_id);
create index if not exists idx_inventory_barcode on public.inventory(barcode);

drop trigger if exists trg_inventory_updated_at on public.inventory;
create trigger trg_inventory_updated_at
before update on public.inventory
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------
-- repairs
-- ------------------------------------------------------------------------------
create table if not exists public.repairs (
    id text primary key,
    shop_id text references public.shops(id) on delete cascade,
    "refId" text,
    "customerName" text,
    phone text,
    "deviceModel" text,
    imei text,
    problem text,
    status text default 'pending',
    "estimatedCost" numeric default 0,
    "finalAmount" numeric default 0,
    "partsCost" numeric default 0,
    "deliveryDate" text,
    "partsUsed" jsonb default '[]'::jsonb,
    "createdAt" timestamptz default now(),
    "completedAt" timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_repairs_shop_id on public.repairs(shop_id);

drop trigger if exists trg_repairs_updated_at on public.repairs;
create trigger trg_repairs_updated_at
before update on public.repairs
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------
-- transactions
-- ------------------------------------------------------------------------------
create table if not exists public.transactions (
    id text primary key,
    shop_id text references public.shops(id) on delete cascade,
    user_id text,
    "order_id" text,
    "desc" text,
    amount numeric default 0,
    type text,
    category text,
    notes text,
    source text,
    quantity integer default 1,
    date text,
    time text,
    timestamp timestamptz default now(),
    "isFixedExpense" boolean default false,
    "productId" text references public.inventory(id) on delete set null,
    "workerId" text,
    "salesmanName" text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_transactions_shop_id on public.transactions(shop_id);
create index if not exists idx_transactions_timestamp on public.transactions(timestamp desc);
create index if not exists idx_transactions_workerid on public.transactions("workerId");

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------
-- attendance (DB truth for punch status)
-- ------------------------------------------------------------------------------
create table if not exists public.attendance (
    id text primary key,
    shop_id text not null references public.shops(id) on delete cascade,
    user_id text not null references public.profiles(id) on delete cascade,
    user_name text,
    date text,
    check_in timestamptz,
    check_out timestamptz,
    hours numeric default 0,
    status text default 'present',
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_attendance_shop_user on public.attendance(shop_id, user_id);
create index if not exists idx_attendance_open on public.attendance(shop_id, user_id)
where check_in is not null and check_out is null;
create index if not exists idx_attendance_checkin on public.attendance(check_in desc);

drop trigger if exists trg_attendance_updated_at on public.attendance;
create trigger trg_attendance_updated_at
before update on public.attendance
for each row execute function public.set_updated_at();

-- Keep profiles.is_online consistent with attendance open sessions
create or replace function public.sync_profiles_online_from_attendance()
returns trigger as $$
declare
    target_user_id text;
    target_shop_id text;
    has_open boolean;
begin
    target_user_id := coalesce(new.user_id, old.user_id);
    target_shop_id := coalesce(new.shop_id, old.shop_id);

    select exists (
        select 1
        from public.attendance a
        where a.user_id = target_user_id
            and a.shop_id = target_shop_id
            and a.check_in is not null
            and a.check_out is null
    ) into has_open;

    update public.profiles
    set is_online = has_open,
            updated_at = now()
    where id = target_user_id;

    return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_attendance_sync_profile_online_iud on public.attendance;
create trigger trg_attendance_sync_profile_online_iud
after insert or update or delete on public.attendance
for each row execute function public.sync_profiles_online_from_attendance();

-- ------------------------------------------------------------------------------
-- app_state (for server state client)
-- ------------------------------------------------------------------------------
create table if not exists public.app_state (
    state_key text not null,
    shop_id text not null default '',
    user_id text not null default '',
    state_value jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (state_key, shop_id, user_id)
);

drop trigger if exists trg_app_state_updated_at on public.app_state;
create trigger trg_app_state_updated_at
before update on public.app_state
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------
-- RLS (current app behavior: allow anon/authenticated; tighten later if needed)
-- ------------------------------------------------------------------------------
alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.inventory enable row level security;
alter table public.repairs enable row level security;
alter table public.transactions enable row level security;
alter table public.attendance enable row level security;
alter table public.app_state enable row level security;

drop policy if exists "allow_all_shops" on public.shops;
create policy "allow_all_shops" on public.shops for all
using (auth.role() in ('anon','authenticated'))
with check (auth.role() in ('anon','authenticated'));

drop policy if exists "allow_all_profiles" on public.profiles;
create policy "allow_all_profiles" on public.profiles for all
using (auth.role() in ('anon','authenticated'))
with check (auth.role() in ('anon','authenticated'));

drop policy if exists "allow_all_categories" on public.categories;
create policy "allow_all_categories" on public.categories for all
using (auth.role() in ('anon','authenticated'))
with check (auth.role() in ('anon','authenticated'));

drop policy if exists "allow_all_inventory" on public.inventory;
create policy "allow_all_inventory" on public.inventory for all
using (auth.role() in ('anon','authenticated'))
with check (auth.role() in ('anon','authenticated'));

drop policy if exists "allow_all_repairs" on public.repairs;
create policy "allow_all_repairs" on public.repairs for all
using (auth.role() in ('anon','authenticated'))
with check (auth.role() in ('anon','authenticated'));

drop policy if exists "allow_all_transactions" on public.transactions;
create policy "allow_all_transactions" on public.transactions for all
using (auth.role() in ('anon','authenticated'))
with check (auth.role() in ('anon','authenticated'));

drop policy if exists "allow_all_attendance" on public.attendance;
create policy "allow_all_attendance" on public.attendance for all
using (auth.role() in ('anon','authenticated'))
with check (auth.role() in ('anon','authenticated'));

drop policy if exists "allow_all_app_state" on public.app_state;
create policy "allow_all_app_state" on public.app_state for all
using (auth.role() in ('anon','authenticated'))
with check (auth.role() in ('anon','authenticated'));

-- ==============================================================================
-- SCHEMA READY
-- ==============================================================================
