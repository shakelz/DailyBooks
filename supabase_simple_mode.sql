-- DailyBooks Simple Mode (No RLS + No helper RPC dependencies)
-- Run in Supabase SQL Editor if you want a fully simplified setup.

begin;

-- 0) KPI support table: category contribution mode for Revenue/Expense KPI calculations
create table if not exists public.kpi_profit_category_settings (
  shop_id uuid not null,
  category_name text not null,
  sub_category_name text not null default '',
  contribution_mode text not null default 'sales',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint kpi_profit_category_settings_mode_chk check (contribution_mode in ('sales', 'profit', 'excluded')),
  primary key (shop_id, category_name, sub_category_name)
);
create index if not exists idx_kpi_profit_category_settings_shop
  on public.kpi_profit_category_settings(shop_id);

-- Backward compatibility: migrate older boolean column to contribution_mode if needed.
alter table if exists public.kpi_profit_category_settings
  add column if not exists contribution_mode text;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'kpi_profit_category_settings'
      AND column_name = 'profit_only'
  ) THEN
    UPDATE public.kpi_profit_category_settings
    SET contribution_mode = CASE WHEN coalesce(profit_only, false) THEN 'profit' ELSE 'sales' END
    WHERE coalesce(trim(contribution_mode), '') = '';
  ELSE
    UPDATE public.kpi_profit_category_settings
    SET contribution_mode = 'sales'
    WHERE coalesce(trim(contribution_mode), '') = '';
  END IF;
END
$$;
alter table if exists public.kpi_profit_category_settings
  alter column contribution_mode set default 'sales';
alter table if exists public.kpi_profit_category_settings
  alter column contribution_mode set not null;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kpi_profit_category_settings_mode_chk'
  ) THEN
    ALTER TABLE public.kpi_profit_category_settings
      ADD CONSTRAINT kpi_profit_category_settings_mode_chk
      CHECK (contribution_mode in ('sales', 'profit', 'excluded'));
  END IF;
END
$$;

-- 1) Disable RLS on app tables
alter table if exists public.shops disable row level security;
alter table if exists public.profiles disable row level security;
alter table if exists public.categories disable row level security;
alter table if exists public.inventory disable row level security;
alter table if exists public.online_part_orders disable row level security;
alter table if exists public.repairs disable row level security;
alter table if exists public.transactions disable row level security;
alter table if exists public.attendance disable row level security;
alter table if exists public.kpi_profit_category_settings disable row level security;

-- 2) Drop all existing policies from target tables
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'shops', 'profiles', 'categories', 'inventory',
        'online_part_orders', 'repairs', 'transactions', 'attendance',
        'kpi_profit_category_settings'
      )
  LOOP
    EXECUTE format('drop policy if exists %I on %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END
$$;

-- 3) Optional: drop helper RPC functions (app now has direct-query fallbacks)
drop function if exists public.make_pin_digest_global(text);
drop function if exists public.verify_salesman_pin(text, text);
drop function if exists public.resolve_admin_auth_email(text);
drop function if exists public.create_or_link_shop_owner_profile(text, text, text, text, text);
drop function if exists public.create_shop_record(text, text, text, text, text);
drop function if exists public.list_shops_safe(text);
drop function if exists public.make_pin_digest(text, text);
drop function if exists public.make_owner_password_hash(text);
drop function if exists public.verify_owner_login(text, text);

-- 4) Repairs compatibility: remove 255-char limit on problem description
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'repairs'
      AND column_name = 'problem'
      AND data_type IN ('character varying', 'varchar')
  ) THEN
    ALTER TABLE public.repairs
      ALTER COLUMN problem TYPE text;
  END IF;
END
$$;

-- 5) Online orders compatibility: make status columns text to avoid enum value mismatches
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'online_part_orders'
      AND column_name = 'status'
      AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE public.online_part_orders
      ALTER COLUMN status TYPE text USING status::text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'online_part_orders'
      AND column_name = 'part_order_status'
      AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE public.online_part_orders
      ALTER COLUMN part_order_status TYPE text USING part_order_status::text;
  END IF;
END
$$;

-- 6) Repairs compatibility: allow short date invoice numbers (YYMMDD) without unique-key collisions
DO $$
DECLARE
  idx record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'repairs_invoice_number_key'
      AND conrelid = 'public.repairs'::regclass
  ) THEN
    ALTER TABLE public.repairs
      DROP CONSTRAINT repairs_invoice_number_key;
  END IF;

  FOR idx IN
    SELECT i.relname AS index_name
    FROM pg_class t
    JOIN pg_index x ON x.indrelid = t.oid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'repairs'
      AND x.indisunique = true
      AND EXISTS (
        SELECT 1
        FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE a.attname = 'invoice_number'
      )
  LOOP
    EXECUTE format('drop index if exists public.%I;', idx.index_name);
  END LOOP;
END
$$;

-- 7) Profiles compatibility: keep single salesman number column + profile image column
alter table if exists public.profiles
  add column if not exists salesman_number integer;
alter table if exists public.profiles
  add column if not exists profile_image text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'salesman_no'
  ) THEN
    UPDATE public.profiles
    SET salesman_number = coalesce(salesman_number, salesman_no)
    WHERE salesman_number IS NULL;

    ALTER TABLE public.profiles DROP COLUMN salesman_no;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'photo'
  ) THEN
    UPDATE public.profiles
    SET profile_image = coalesce(profile_image, photo)
    WHERE profile_image IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'image_url'
  ) THEN
    UPDATE public.profiles
    SET profile_image = coalesce(profile_image, image_url)
    WHERE profile_image IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'avatar_url'
  ) THEN
    UPDATE public.profiles
    SET profile_image = coalesce(profile_image, avatar_url)
    WHERE profile_image IS NULL;
  END IF;

  UPDATE public.profiles
  SET salesman_number = coalesce(salesman_number, 0)
  WHERE salesman_number IS NULL;
END
$$;

-- 8) Introspection helpers (run these manually in SQL editor when debugging schema drift)
-- A) List online_part_orders columns + data types
-- SELECT column_name, data_type, udt_name
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='online_part_orders'
-- ORDER BY ordinal_position;

-- B) List enum labels for any enum used by online_part_orders columns
-- SELECT c.column_name, t.typname AS enum_type, e.enumlabel
-- FROM information_schema.columns c
-- JOIN pg_type t ON t.typname = c.udt_name
-- JOIN pg_enum e ON e.enumtypid = t.oid
-- WHERE c.table_schema='public' AND c.table_name='online_part_orders'
-- ORDER BY c.column_name, e.enumsortorder;

commit;
