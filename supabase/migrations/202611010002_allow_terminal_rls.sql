-- ==============================================================================
-- Migration: Allow Point-of-Sale Terminals & Salesmen full access to tables
-- Fixes: "new row violates row-level security policy for table categories/transactions/inventory"
-- ==============================================================================

-- 1. CATEGORIES TABLE
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_categories" ON public.categories;
DROP POLICY IF EXISTS "Enable Read/Write for Authenticated Users on Categories" ON public.categories;
CREATE POLICY "allow_all_categories" ON public.categories
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 2. INVENTORY (PRODUCTS) TABLE
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_inventory" ON public.inventory;
DROP POLICY IF EXISTS "Enable Read/Write for Authenticated Users on Inventory" ON public.inventory;
CREATE POLICY "allow_all_inventory" ON public.inventory
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 3. TRANSACTIONS TABLE
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_transactions" ON public.transactions;
DROP POLICY IF EXISTS "Enable Read/Write for Authenticated Users on Transactions" ON public.transactions;
CREATE POLICY "allow_all_transactions" ON public.transactions
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 4. TRANSACTION_ITEMS TABLE
DO $$
BEGIN
    IF to_regclass('public.transaction_items') IS NOT NULL THEN
        ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "allow_all_transaction_items" ON public.transaction_items;
        CREATE POLICY "allow_all_transaction_items" ON public.transaction_items
            FOR ALL TO anon, authenticated
            USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 5. REPAIRS TABLE
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_repairs" ON public.repairs;
DROP POLICY IF EXISTS "Enable Read/Write for Authenticated Users on Repairs" ON public.repairs;
CREATE POLICY "allow_all_repairs" ON public.repairs
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 6. REPAIR_PARTS TABLE
DO $$
BEGIN
    IF to_regclass('public.repair_parts') IS NOT NULL THEN
        ALTER TABLE public.repair_parts ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "allow_all_repair_parts" ON public.repair_parts;
        CREATE POLICY "allow_all_repair_parts" ON public.repair_parts
            FOR ALL TO anon, authenticated
            USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 7. ATTENDANCE TABLE
DO $$
BEGIN
    IF to_regclass('public.attendance') IS NOT NULL THEN
        ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "allow_all_attendance" ON public.attendance;
        DROP POLICY IF EXISTS "Enable Read/Write for Authenticated Users on Attendance" ON public.attendance;
        CREATE POLICY "allow_all_attendance" ON public.attendance
            FOR ALL TO anon, authenticated
            USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 8. SHOPS TABLE (already allowed read, ensure write for authenticated/anon if needed)
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access to shops" ON public.shops;
CREATE POLICY "Allow public read access to shops" ON public.shops
    FOR SELECT TO anon, authenticated
    USING (true);

-- 9. KPI PROFIT CATEGORY SETTINGS TABLE (EXCLUDED CATEGORIES)
DO $$
BEGIN
    IF to_regclass('public.kpi_profit_category_settings') IS NOT NULL THEN
        ALTER TABLE public.kpi_profit_category_settings ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "allow_all_kpi_profit_category_settings" ON public.kpi_profit_category_settings;
        CREATE POLICY "allow_all_kpi_profit_category_settings" ON public.kpi_profit_category_settings
            FOR ALL TO anon, authenticated
            USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 10. PROFILES TABLE (SALESMEN & STAFF ACCOUNTS)
DO $$
BEGIN
    IF to_regclass('public.profiles') IS NOT NULL THEN
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "allow_all_profiles" ON public.profiles;
        CREATE POLICY "allow_all_profiles" ON public.profiles
            FOR ALL TO anon, authenticated
            USING (true) WITH CHECK (true);

        -- Ensure foreign key constraint does not block salesman creation if not in auth.users
        ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
    END IF;
END $$;


