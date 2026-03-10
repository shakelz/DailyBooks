CREATE OR REPLACE FUNCTION public.repair_trigger_text(payload jsonb, keys text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  key text;
  value text;
BEGIN
  FOREACH key IN ARRAY keys LOOP
    value := NULLIF(BTRIM(payload ->> key), '');
    IF value IS NOT NULL THEN
      RETURN value;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_trigger_numeric(payload jsonb, keys text[])
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  key text;
  raw_value text;
BEGIN
  FOREACH key IN ARRAY keys LOOP
    raw_value := NULLIF(BTRIM(payload ->> key), '');
    IF raw_value IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      RETURN raw_value::numeric;
    EXCEPTION
      WHEN OTHERS THEN
        CONTINUE;
    END;
  END LOOP;

  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.transactions_column_exists(column_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = $1
  );
$$;

CREATE OR REPLACE FUNCTION public.transactions_pick_column_value(column_name text, preferred_values text[])
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  column_data_type text;
  column_udt_schema text;
  column_udt_name text;
  candidate text;
BEGIN
  SELECT c.data_type, c.udt_schema, c.udt_name
  INTO column_data_type, column_udt_schema, column_udt_name
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'transactions'
    AND c.column_name = column_name
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF column_data_type <> 'USER-DEFINED' THEN
    RETURN preferred_values[1];
  END IF;

  FOREACH candidate IN ARRAY preferred_values LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_type AS t
      JOIN pg_namespace AS n
        ON n.oid = t.typnamespace
      JOIN pg_enum AS e
        ON e.enumtypid = t.oid
      WHERE n.nspname = column_udt_schema
        AND t.typname = column_udt_name
        AND e.enumlabel = candidate
    ) THEN
      RETURN candidate;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_repair_payment_transaction(
  repair_payload jsonb,
  payment_amount numeric,
  payment_stage text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  repair_id_text text := COALESCE(
    public.repair_trigger_text(repair_payload, ARRAY['repair_id', 'job_id', 'id']),
    ''
  );
  shop_id_text text := COALESCE(
    public.repair_trigger_text(repair_payload, ARRAY['shop_id', 'shopId']),
    ''
  );
  invoice_number_text text := COALESCE(
    public.repair_trigger_text(repair_payload, ARRAY['invoice_number', 'invoiceNumber', 'ref_id', 'refId']),
    repair_id_text
  );
  amount_value numeric := GREATEST(COALESCE(payment_amount, 0), 0);
  normalized_stage text := LOWER(COALESCE(payment_stage, ''));
  description_text text;
  category_text text;
  audit_note text;
  repair_uuid uuid;
  transaction_columns text[] := ARRAY[]::text[];
  transaction_values text[] := ARRAY[]::text[];
  duplicate_exists boolean := false;
  value_text text;
  duplicate_sql text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
  ) THEN
    RETURN;
  END IF;

  IF amount_value <= 0 OR shop_id_text = '' THEN
    RETURN;
  END IF;

  description_text := CASE
    WHEN normalized_stage = 'advance' THEN 'Advance for Repair Job #' || invoice_number_text
    ELSE 'Final payment for Repair Job #' || invoice_number_text
  END;
  category_text := CASE
    WHEN normalized_stage = 'advance' THEN 'Repair Advance'
    ELSE 'Repair Final'
  END;
  audit_note := FORMAT(
    'repair_payment_stage=%s;repair_id=%s;invoice_number=%s',
    normalized_stage,
    NULLIF(repair_id_text, ''),
    NULLIF(invoice_number_text, '')
  );

  IF repair_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    repair_uuid := repair_id_text::uuid;
  ELSE
    repair_uuid := NULL;
  END IF;

  IF public.transactions_column_exists('repair_id') AND repair_uuid IS NOT NULL AND public.transactions_column_exists('category') THEN
    duplicate_sql := 'SELECT EXISTS (SELECT 1 FROM public.transactions WHERE repair_id = $1 AND category = $2';
    IF public.transactions_column_exists('shop_id') THEN
      duplicate_sql := duplicate_sql || ' AND shop_id = $3';
      duplicate_sql := duplicate_sql || ')';
      EXECUTE duplicate_sql INTO duplicate_exists USING repair_uuid, category_text, shop_id_text;
    ELSE
      duplicate_sql := duplicate_sql || ')';
      EXECUTE duplicate_sql INTO duplicate_exists USING repair_uuid, category_text;
    END IF;
  ELSIF public.transactions_column_exists('notes') THEN
    duplicate_sql := 'SELECT EXISTS (SELECT 1 FROM public.transactions WHERE notes = $1';
    IF public.transactions_column_exists('shop_id') THEN
      duplicate_sql := duplicate_sql || ' AND shop_id = $2';
      duplicate_sql := duplicate_sql || ')';
      EXECUTE duplicate_sql INTO duplicate_exists USING audit_note, shop_id_text;
    ELSE
      duplicate_sql := duplicate_sql || ')';
      EXECUTE duplicate_sql INTO duplicate_exists USING audit_note;
    END IF;
  END IF;

  IF duplicate_exists THEN
    RETURN;
  END IF;

  IF public.transactions_column_exists('shop_id') THEN
    transaction_columns := transaction_columns || 'shop_id';
    transaction_values := transaction_values || FORMAT('%L', shop_id_text);
  END IF;

  IF public.transactions_column_exists('amount') THEN
    transaction_columns := transaction_columns || 'amount';
    transaction_values := transaction_values || FORMAT('%L', amount_value);
  END IF;

  IF public.transactions_column_exists('type') THEN
    value_text := public.transactions_pick_column_value('type', ARRAY['income']);
    IF value_text IS NOT NULL THEN
      transaction_columns := transaction_columns || 'type';
      transaction_values := transaction_values || FORMAT('%L', value_text);
    END IF;
  END IF;

  IF public.transactions_column_exists('tx_type') THEN
    value_text := public.transactions_pick_column_value('tx_type', ARRAY['repair_amount', 'repair_job', 'income']);
    IF value_text IS NOT NULL THEN
      transaction_columns := transaction_columns || 'tx_type';
      transaction_values := transaction_values || FORMAT('%L', value_text);
    END IF;
  END IF;

  IF public.transactions_column_exists('description') THEN
    transaction_columns := transaction_columns || 'description';
    transaction_values := transaction_values || FORMAT('%L', description_text);
  END IF;

  IF public.transactions_column_exists('desc') THEN
    transaction_columns := transaction_columns || 'desc';
    transaction_values := transaction_values || FORMAT('%L', description_text);
  END IF;

  IF public.transactions_column_exists('category') THEN
    transaction_columns := transaction_columns || 'category';
    transaction_values := transaction_values || FORMAT('%L', category_text);
  END IF;

  IF public.transactions_column_exists('source') THEN
    value_text := public.transactions_pick_column_value('source', ARRAY['repair']);
    IF value_text IS NOT NULL THEN
      transaction_columns := transaction_columns || 'source';
      transaction_values := transaction_values || FORMAT('%L', value_text);
    END IF;
  END IF;

  IF public.transactions_column_exists('tx_source') THEN
    value_text := public.transactions_pick_column_value('tx_source', ARRAY['repair']);
    IF value_text IS NOT NULL THEN
      transaction_columns := transaction_columns || 'tx_source';
      transaction_values := transaction_values || FORMAT('%L', value_text);
    END IF;
  END IF;

  IF public.transactions_column_exists('repair_id') AND repair_uuid IS NOT NULL THEN
    transaction_columns := transaction_columns || 'repair_id';
    transaction_values := transaction_values || FORMAT('%L', repair_uuid);
  END IF;

  IF public.transactions_column_exists('invoice_number') AND invoice_number_text <> '' THEN
    transaction_columns := transaction_columns || 'invoice_number';
    transaction_values := transaction_values || FORMAT('%L', invoice_number_text);
  END IF;

  IF public.transactions_column_exists('notes') THEN
    transaction_columns := transaction_columns || 'notes';
    transaction_values := transaction_values || FORMAT('%L', audit_note);
  END IF;

  IF public.transactions_column_exists('quantity') THEN
    transaction_columns := transaction_columns || 'quantity';
    transaction_values := transaction_values || '1';
  END IF;

  IF public.transactions_column_exists('created_at') THEN
    transaction_columns := transaction_columns || 'created_at';
    transaction_values := transaction_values || FORMAT('%L', NOW());
  END IF;

  IF public.transactions_column_exists('updated_at') THEN
    transaction_columns := transaction_columns || 'updated_at';
    transaction_values := transaction_values || FORMAT('%L', NOW());
  END IF;

  IF public.transactions_column_exists('occurred_at') THEN
    transaction_columns := transaction_columns || 'occurred_at';
    transaction_values := transaction_values || FORMAT('%L', NOW());
  END IF;

  IF array_length(transaction_columns, 1) IS NULL THEN
    RAISE EXCEPTION 'Could not resolve any writable transactions columns for repair payment trigger.';
  END IF;

  EXECUTE FORMAT(
    'INSERT INTO public.transactions (%s) VALUES (%s)',
    array_to_string(transaction_columns, ', '),
    array_to_string(transaction_values, ', ')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_repair_advance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  payload jsonb := TO_JSONB(NEW);
  advance_amount numeric := GREATEST(
    COALESCE(public.repair_trigger_numeric(payload, ARRAY['advance_amount', 'advanceAmount']), 0),
    0
  );
BEGIN
  IF advance_amount > 0 THEN
    PERFORM public.insert_repair_payment_transaction(payload, advance_amount, 'advance');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_repair_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  old_payload jsonb := TO_JSONB(OLD);
  new_payload jsonb := TO_JSONB(NEW);
  previous_status text := LOWER(COALESCE(public.repair_trigger_text(old_payload, ARRAY['status']), ''));
  current_status text := LOWER(COALESCE(public.repair_trigger_text(new_payload, ARRAY['status']), ''));
  total_amount numeric := GREATEST(
    COALESCE(public.repair_trigger_numeric(new_payload, ARRAY['total_amount', 'estimated_cost', 'estimatedCost']), 0),
    0
  );
  advance_amount numeric := GREATEST(
    COALESCE(public.repair_trigger_numeric(new_payload, ARRAY['advance_amount', 'advanceAmount']), 0),
    0
  );
  remaining_amount numeric := GREATEST(total_amount - advance_amount, 0);
BEGIN
  IF current_status = 'completed'
    AND previous_status IS DISTINCT FROM 'completed'
    AND remaining_amount > 0 THEN
    PERFORM public.insert_repair_payment_transaction(new_payload, remaining_amount, 'final');
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  attached_trigger_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
  ) THEN
    RAISE NOTICE 'public.transactions table not found. Repair payment triggers were not attached.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'repairs'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS handle_repair_advance ON public.repairs';
    EXECUTE 'CREATE TRIGGER handle_repair_advance AFTER INSERT ON public.repairs FOR EACH ROW EXECUTE FUNCTION public.handle_repair_advance()';
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'repairs'
        AND column_name = 'status'
    ) THEN
      EXECUTE 'DROP TRIGGER IF EXISTS handle_repair_completion ON public.repairs';
      EXECUTE 'CREATE TRIGGER handle_repair_completion AFTER UPDATE OF status ON public.repairs FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.handle_repair_completion()';
    END IF;
    attached_trigger_count := attached_trigger_count + 1;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'repair_jobs'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS handle_repair_advance ON public.repair_jobs';
    EXECUTE 'CREATE TRIGGER handle_repair_advance AFTER INSERT ON public.repair_jobs FOR EACH ROW EXECUTE FUNCTION public.handle_repair_advance()';
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'repair_jobs'
        AND column_name = 'status'
    ) THEN
      EXECUTE 'DROP TRIGGER IF EXISTS handle_repair_completion ON public.repair_jobs';
      EXECUTE 'CREATE TRIGGER handle_repair_completion AFTER UPDATE OF status ON public.repair_jobs FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.handle_repair_completion()';
    END IF;
    attached_trigger_count := attached_trigger_count + 1;
  END IF;

  IF attached_trigger_count = 0 THEN
    RAISE NOTICE 'No public.repairs or public.repair_jobs table found. Repair payment triggers were not attached.';
  END IF;
END;
$$;
