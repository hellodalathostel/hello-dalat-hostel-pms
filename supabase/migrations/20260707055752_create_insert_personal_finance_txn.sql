-- Migration: create_insert_personal_finance_txn
-- Lý do: brain schema không expose qua PostgREST (chỉ public, graphql_public được expose),
-- Edge Function telegram-finance-bot dùng service_role cần 1 RPC trong public
-- để insert hộ vào brain.personal_finances.
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

-- Chỉ service_role (Edge Function) được gọi RPC này
REVOKE EXECUTE ON FUNCTION public.insert_personal_finance_txn FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_personal_finance_txn TO service_role;
