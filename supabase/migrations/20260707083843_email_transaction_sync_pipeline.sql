-- Email transaction sync pipeline (2026-07-07)
-- 1. Them cot direction vao brain.card_transactions_raw (bang dang 0 rows, an toan)
ALTER TABLE brain.card_transactions_raw
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'out'
  CHECK (direction IN ('in', 'out'));

COMMENT ON COLUMN brain.card_transactions_raw.direction IS
  'in = tien vao (cong tien, vd coc khach chuyen VCB), out = tien ra (chi tieu the). amount luon duong.';

-- 2. RPC ingest batch — Edge Function goi qua service_role, dedupe theo email_message_id
CREATE OR REPLACE FUNCTION public.ingest_card_transactions(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'brain', 'public'
AS $$
DECLARE
  v_inserted integer := 0;
  v_row jsonb;
  v_count integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows phai la jsonb array' USING ERRCODE = 'P0001';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO brain.card_transactions_raw
      (bank, card_last4, txn_datetime, amount, currency, direction,
       merchant_raw, payment_method, email_message_id, email_subject, raw_snippet)
    VALUES (
      v_row->>'bank',
      v_row->>'card_last4',
      NULLIF(v_row->>'txn_datetime', '')::timestamptz,
      (v_row->>'amount')::numeric,
      COALESCE(NULLIF(v_row->>'currency', ''), 'VND'),
      COALESCE(NULLIF(v_row->>'direction', ''), 'out'),
      v_row->>'merchant_raw',
      v_row->>'payment_method',
      v_row->>'email_message_id',
      v_row->>'email_subject',
      left(v_row->>'raw_snippet', 1000)
    )
    ON CONFLICT (email_message_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := v_inserted + v_count;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingest_card_transactions(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ingest_card_transactions(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ingest_card_transactions(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_card_transactions(jsonb) TO service_role;
