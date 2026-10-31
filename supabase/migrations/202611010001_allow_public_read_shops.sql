-- Migration: Allow public (anon + authenticated) read-only access to shops table
-- This allows point-of-sale terminals to list and select shop branches without requiring admin login first.

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'shops' 
        AND policyname = 'Allow public read access to shops'
    ) THEN
        CREATE POLICY "Allow public read access to shops"
        ON public.shops
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
END $$;
