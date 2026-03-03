-- DailyBooks: remove requested columns from core tables
-- Run once in Supabase SQL Editor.

begin;

-- Remove update triggers that depend on dropped updated_at columns.
drop trigger if exists trg_shops_updated_at on public.shops;
drop trigger if exists trg_profiles_updated_at on public.profiles;
drop trigger if exists trg_categories_updated_at on public.categories;
drop trigger if exists trg_inventory_updated_at on public.inventory;
drop trigger if exists trg_repairs_updated_at on public.repairs;
drop trigger if exists trg_transactions_updated_at on public.transactions;
drop trigger if exists trg_attendance_updated_at on public.attendance;

-- 1) categories: remove timestamp, updated_at
alter table if exists public.categories
    drop column if exists timestamp,
    drop column if exists updated_at;

-- 2) attendance: remove user_name, date, note, updated_at
alter table if exists public.attendance
    drop column if exists user_name,
    drop column if exists date,
    drop column if exists note,
    drop column if exists updated_at;

-- 3) inventory: remove timestamp, updated_at
alter table if exists public.inventory
    drop column if exists timestamp,
    drop column if exists updated_at;

-- 4) profiles: remove updated_at
alter table if exists public.profiles
    drop column if exists updated_at;

-- 5) repairs: remove finalAmount, updated_at, partsCost
alter table if exists public.repairs
    drop column if exists "finalAmount",
    drop column if exists updated_at,
    drop column if exists "partsCost";

-- 6) shops: remove location, updated_at
alter table if exists public.shops
    drop column if exists location,
    drop column if exists updated_at;

-- 7) transactions: remove user_id, order_id, timestamp, updated_at
alter table if exists public.transactions
    drop column if exists user_id,
    drop column if exists "order_id",
    drop column if exists timestamp,
    drop column if exists updated_at;

-- Replace removed timestamp index with created_at index for transactions ordering.
drop index if exists public.idx_transactions_timestamp;
create index if not exists idx_transactions_created_at on public.transactions(created_at desc);

-- Refresh attendance->profiles online sync function (profiles.updated_at no longer exists).
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
    set is_online = has_open
    where id = target_user_id;

    return coalesce(new, old);
end;
$$ language plpgsql;

commit;
