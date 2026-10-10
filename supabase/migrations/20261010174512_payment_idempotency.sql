-- Chong ghi trung thanh toan: ham boc quanh record_payment_txn + bang log request_id.
-- record_payment_txn giu nguyen (checkout_last_booking_and_settle_txn van goi truc tiep).

CREATE TABLE public.payment_request_log (
  request_id uuid PRIMARY KEY,
  group_id   uuid           NOT NULL,   -- khong FK: giu nguyen loi GROUP_NOT_FOUND cua record_payment_txn
  amount     integer        NOT NULL,
  method     payment_method NOT NULL,
  result     jsonb          NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_request_log_group ON public.payment_request_log (group_id);

-- RLS + GRANT: khong client nao duoc cham. service_role chi doc (bai hoc 10/10/2026).
ALTER TABLE public.payment_request_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_request_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.payment_request_log TO service_role;

CREATE OR REPLACE FUNCTION public.record_payment_idempotent_txn(
  p_request_id       uuid,
  p_group_id         uuid,
  p_amount           integer,
  p_method           payment_method,
  p_note             text DEFAULT NULL,
  p_first_booking_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_inserted integer;
  v_log      public.payment_request_log%ROWTYPE;
  v_result   jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUEST_ID: bắt buộc có request_id.' USING ERRCODE = 'P0016';
  END IF;

  -- Cung request_id den dong thoi: lan hai cho lan mot commit/rollback roi moi biet ket qua.
  INSERT INTO public.payment_request_log (request_id, group_id, amount, method, created_by)
  VALUES (p_request_id, p_group_id, p_amount, p_method, auth.uid())
  ON CONFLICT (request_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT * INTO v_log FROM public.payment_request_log WHERE request_id = p_request_id;

    IF v_log.group_id IS DISTINCT FROM p_group_id
       OR v_log.amount IS DISTINCT FROM p_amount
       OR v_log.method IS DISTINCT FROM p_method THEN
      RAISE EXCEPTION 'REQUEST_ID_REUSED: request_id % đã dùng cho một thanh toán khác.', p_request_id
        USING ERRCODE = 'P0017';
    END IF;

    RETURN (v_log.result || jsonb_build_object('replayed', true))::json;
  END IF;

  -- Loi o day (OVERPAYMENT, GROUP_NOT_FOUND, ...) rollback ca dong log -> retry cung id van chay duoc.
  v_result := public.record_payment_txn(p_group_id, p_amount, p_method, p_note, p_first_booking_id)::jsonb;

  UPDATE public.payment_request_log SET result = v_result WHERE request_id = p_request_id;

  RETURN (v_result || jsonb_build_object('replayed', false))::json;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_idempotent_txn(uuid, uuid, integer, payment_method, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment_idempotent_txn(uuid, uuid, integer, payment_method, text, uuid) TO authenticated, service_role;
