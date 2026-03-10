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
  transaction_invoice_number_text text;
  repair_uuid uuid;
  shop_uuid uuid;
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
  transaction_invoice_number_text := CASE
    WHEN normalized_stage = 'advance' THEN invoice_number_text || '-ADVANCE'
    ELSE invoice_number_text || '-FINAL'
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

  IF shop_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    shop_uuid := shop_id_text::uuid;
  ELSE
    RETURN;
  END IF;

  IF public.transactions_column_exists('repair_id') AND repair_uuid IS NOT NULL AND public.transactions_column_exists('category') THEN
    duplicate_sql := 'SELECT EXISTS (SELECT 1 FROM public.transactions WHERE repair_id = $1 AND category = $2';
    IF public.transactions_column_exists('shop_id') THEN
      duplicate_sql := duplicate_sql || ' AND shop_id = $3';
      duplicate_sql := duplicate_sql || ')';
      EXECUTE duplicate_sql INTO duplicate_exists USING repair_uuid, category_text, shop_uuid;
    ELSE
      duplicate_sql := duplicate_sql || ')';
      EXECUTE duplicate_sql INTO duplicate_exists USING repair_uuid, category_text;
    END IF;
  ELSIF public.transactions_column_exists('notes') THEN
    duplicate_sql := 'SELECT EXISTS (SELECT 1 FROM public.transactions WHERE notes = $1';
    IF public.transactions_column_exists('shop_id') THEN
      duplicate_sql := duplicate_sql || ' AND shop_id = $2';
      duplicate_sql := duplicate_sql || ')';
      EXECUTE duplicate_sql INTO duplicate_exists USING audit_note, shop_uuid;
    ELSE
      duplicate_sql := duplicate_sql || ')';
      EXECUTE duplicate_sql INTO duplicate_exists USING audit_note;
    END IF;
  END IF;

  IF duplicate_exists THEN
    RETURN;
  END IF;

  IF public.transactions_column_exists('shop_id') THEN
    transaction_columns := array_append(transaction_columns, 'shop_id');
    transaction_values := array_append(transaction_values, FORMAT('%L::uuid', shop_uuid));
  END IF;

  IF public.transactions_column_exists('amount') THEN
    transaction_columns := array_append(transaction_columns, 'amount');
    transaction_values := array_append(transaction_values, FORMAT('%L', amount_value));
  END IF;

  IF public.transactions_column_exists('type') THEN
    value_text := public.transactions_pick_column_value('type', ARRAY['income']);
    IF value_text IS NOT NULL THEN
      transaction_columns := array_append(transaction_columns, 'type');
      transaction_values := array_append(transaction_values, FORMAT('%L', value_text));
    END IF;
  END IF;

  IF public.transactions_column_exists('tx_type') THEN
    value_text := public.transactions_pick_column_value('tx_type', ARRAY['repair_amount', 'repair_job', 'income']);
    IF value_text IS NOT NULL THEN
      transaction_columns := array_append(transaction_columns, 'tx_type');
      transaction_values := array_append(transaction_values, FORMAT('%L', value_text));
    END IF;
  END IF;

  IF public.transactions_column_exists('description') THEN
    transaction_columns := array_append(transaction_columns, 'description');
    transaction_values := array_append(transaction_values, FORMAT('%L', description_text));
  END IF;

  IF public.transactions_column_exists('desc') THEN
    transaction_columns := array_append(transaction_columns, 'desc');
    transaction_values := array_append(transaction_values, FORMAT('%L', description_text));
  END IF;

  IF public.transactions_column_exists('category') THEN
    transaction_columns := array_append(transaction_columns, 'category');
    transaction_values := array_append(transaction_values, FORMAT('%L', category_text));
  END IF;

  IF public.transactions_column_exists('source') THEN
    value_text := public.transactions_pick_column_value('source', ARRAY['repair']);
    IF value_text IS NOT NULL THEN
      transaction_columns := array_append(transaction_columns, 'source');
      transaction_values := array_append(transaction_values, FORMAT('%L', value_text));
    END IF;
  END IF;

  IF public.transactions_column_exists('tx_source') THEN
    value_text := public.transactions_pick_column_value('tx_source', ARRAY['repair']);
    IF value_text IS NOT NULL THEN
      transaction_columns := array_append(transaction_columns, 'tx_source');
      transaction_values := array_append(transaction_values, FORMAT('%L', value_text));
    END IF;
  END IF;

  IF public.transactions_column_exists('repair_id') AND repair_uuid IS NOT NULL THEN
    transaction_columns := array_append(transaction_columns, 'repair_id');
    transaction_values := array_append(transaction_values, FORMAT('%L', repair_uuid));
  END IF;

  IF public.transactions_column_exists('invoice_number') AND transaction_invoice_number_text <> '' THEN
    transaction_columns := array_append(transaction_columns, 'invoice_number');
    transaction_values := array_append(transaction_values, FORMAT('%L', transaction_invoice_number_text));
  END IF;

  IF public.transactions_column_exists('notes') THEN
    transaction_columns := array_append(transaction_columns, 'notes');
    transaction_values := array_append(transaction_values, FORMAT('%L', audit_note));
  END IF;

  IF public.transactions_column_exists('quantity') THEN
    transaction_columns := array_append(transaction_columns, 'quantity');
    transaction_values := array_append(transaction_values, '1');
  END IF;

  IF public.transactions_column_exists('created_at') THEN
    transaction_columns := array_append(transaction_columns, 'created_at');
    transaction_values := array_append(transaction_values, FORMAT('%L', NOW()));
  END IF;

  IF public.transactions_column_exists('updated_at') THEN
    transaction_columns := array_append(transaction_columns, 'updated_at');
    transaction_values := array_append(transaction_values, FORMAT('%L', NOW()));
  END IF;

  IF public.transactions_column_exists('occurred_at') THEN
    transaction_columns := array_append(transaction_columns, 'occurred_at');
    transaction_values := array_append(transaction_values, FORMAT('%L', NOW()));
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
