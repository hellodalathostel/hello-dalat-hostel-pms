-- Migration: create_insert_personal_finance_txn
-- Ngày: 2026-07-06
-- Lý do: brain schema KHÔNG expose qua PostgREST (chỉ public, graphql_public
-- được expose theo config project). Edge Function telegram-finance-bot dùng
-- service_role key nhưng vẫn không thể gọi supabase.schema('brain').from(...)
-- trực tiếp qua client library — bắt buộc phải có RPC trong public schema
-- làm cầu nối để insert hộ vào brain.personal_finances.
--
-- Đã apply qua Supabase MCP apply_migration lúc 2026-07-06 22:xx.
-- File này để đồng bộ lại migration history local, không cần chạy lại trên remote.

CREATE OR REPLACE FUNCTION public.insert_personal_finance_txn(
  p_date date,
  p_category text,
  p_description text,
  p_amount numeric,
  p_source text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO brain.personal_finances (date, category, description, amount, source)
  VALUES (p_date, p_category, p_description, p_amount, p_source)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Chỉ service_role (Edge Function) được gọi RPC này — không phải authenticated user
REVOKE EXECUTE ON FUNCTION public.insert_personal_finance_txn FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_personal_finance_txn TO service_role;
