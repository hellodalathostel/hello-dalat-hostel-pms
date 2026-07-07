-- Migration: create_card_transactions_raw_and_ingest_rpc
-- Ngày: 2026-07-07
-- Lý do: hỗ trợ Edge Function email-transaction-sync (Gmail -> brain.card_transactions_raw).
-- brain schema KHÔNG expose qua PostgREST, nên cần RPC bridge trong public schema
-- giống pattern insert_personal_finance_txn (20260706230000).
--
-- Đã apply qua Supabase MCP apply_migration lúc 2026-07-07. File này để đồng bộ
-- lại migration history local, không cần chạy lại trên remote.

CREATE TABLE IF NOT EXISTS brain.card_transactions_raw (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bank text NOT NULL,
  card_last4 text,
  txn_datetime timestamptz,
  amount numeric NOT NULL,
  currency text DEFAULT 'VND',
  merchant_raw text,
  category text,
  email_message_id text,
  email_subject text,
  raw_snippet text,
  is_reviewed boolean DEFAULT false,
  payment_method text,
  direction text NOT NULL DEFAULT 'out' CHECK (direction = ANY (ARRAY['in', 'out'])),
  created_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN brain.card_transactions_raw.direction IS
  'in = tien vao (cong tien, vd coc khach chuyen VCB), out = tien ra (chi tieu the). amount luon duong.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_txn_email_unique
  ON brain.card_transactions_raw (email_message_id);
CREATE INDEX IF NOT EXISTS idx_card_txn_datetime
  ON brain.card_transactions_raw (txn_datetime);
CREATE INDEX IF NOT EXISTS idx_card_txn_category
  ON brain.card_transactions_raw (category);

ALTER TABLE brain.card_transactions_raw ENABLE ROW LEVEL SECURITY;
-- Không GRANT cho anon/authenticated — bảng brain không expose qua PostgREST,
-- chỉ Edge Function (service_role) đọc/ghi qua RPC bên dưới.
GRANT SELECT, INSERT, UPDATE, DELETE ON brain.card_transactions_raw TO service_role;

CREATE OR REPLACE FUNCTION public.ingest_card_transactions(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'brain', 'public'
AS $function$
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
$function$;

-- Chỉ service_role (Edge Function) được gọi RPC này — không phải authenticated user
REVOKE EXECUTE ON FUNCTION public.ingest_card_transactions FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_card_transactions TO service_role;
