-- DailyBooks Simple Mode (No RLS + No helper RPC dependencies)
-- Run in Supabase SQL Editor if you want a fully simplified setup.

begin;

-- 1) Disable RLS on app tables
alter table if exists public.shops disable row level security;
alter table if exists public.profiles disable row level security;
alter table if exists public.categories disable row level security;
alter table if exists public.inventory disable row level security;
alter table if exists public.online_part_orders disable row level security;
alter table if exists public.repairs disable row level security;
alter table if exists public.transactions disable row level security;
alter table if exists public.attendance disable row level security;

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
        'online_part_orders', 'repairs', 'transactions', 'attendance'
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

-- 6) Introspection helpers (run these manually in SQL editor when debugging schema drift)
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
