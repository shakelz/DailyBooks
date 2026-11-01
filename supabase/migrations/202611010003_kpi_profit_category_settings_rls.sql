-- ==============================================================================
-- Migration: Allow anon & authenticated roles full access to kpi_profit_category_settings
-- Fixes: "new row violates row-level security policy for table kpi_profit_category_settings"
-- Run this in Supabase SQL Editor if you want to allow client-side sync to kpi_profit_category_settings
-- ==============================================================================

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
