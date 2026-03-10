CREATE OR REPLACE FUNCTION public.transactions_column_exists(column_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'transactions'
      AND c.column_name = $1
  );
$$;

CREATE OR REPLACE FUNCTION public.transactions_pick_column_value(
  column_name text,
  preferred_values text[]
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  resolved_column_data_type text;
  resolved_column_udt_schema text;
  resolved_column_udt_name text;
  candidate text;
BEGIN
  SELECT c.data_type, c.udt_schema, c.udt_name
  INTO resolved_column_data_type, resolved_column_udt_schema, resolved_column_udt_name
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'transactions'
    AND c.column_name = transactions_pick_column_value.column_name
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF resolved_column_data_type <> 'USER-DEFINED' THEN
    RETURN transactions_pick_column_value.preferred_values[1];
  END IF;

  FOREACH candidate IN ARRAY transactions_pick_column_value.preferred_values LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_type AS t
      JOIN pg_namespace AS n
        ON n.oid = t.typnamespace
      JOIN pg_enum AS e
        ON e.enumtypid = t.oid
      WHERE n.nspname = resolved_column_udt_schema
        AND t.typname = resolved_column_udt_name
        AND e.enumlabel = candidate
    ) THEN
      RETURN candidate;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;
