-- Migration: ensure repairs.problem has no 255-char limit
-- Safe/idempotent: only alters when the column exists and is varchar/character varying.

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
END $$;
