-- Migration: cancellation_sync_and_brain_rpc_fix
-- Ngay: 2026-08-13
-- Da apply qua Supabase MCP (3 lan apply_migration rieng). File nay gop lai
-- de dong bo migration history local.

-- === Bang log cho tinh nang tu dong huy booking tu email Booking.com ===
CREATE TABLE brain.cancellation_sync_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_message_id TEXT NOT NULL,
  ota_booking_number TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('cancelled', 'already_cancelled', 'not_found', 'error')),
  group_id UUID REFERENCES public.groups(id),
  bookings_cancelled_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_cancellation_sync_log_email_unique ON brain.cancellation_sync_log(email_message_id);
CREATE INDEX idx_cancellation_sync_log_result ON brain.cancellation_sync_log(result);

COMMENT ON TABLE brain.cancellation_sync_log IS
  'Log tu dong dong bo huy booking khi nhan email "Dat phong da huy" tu Booking.com. Moi email = 1 row. result=not_found nghia la res_id trong email khong khop group nao trong PMS (khong phai loi).';

ALTER TABLE brain.cancellation_sync_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON brain.cancellation_sync_log TO service_role;
REVOKE ALL ON brain.cancellation_sync_log FROM PUBLIC, anon, authenticated;
CREATE POLICY "service_role_all" ON brain.cancellation_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- === RPC: ingest_cancellation_sync_log ===
-- BAT BUOC vi schema brain KHONG duoc PostgREST expose -- .from() truc tiep
-- qua REST client THAT BAI AM THAM (khong throw, tra ve rong). Moi ghi/doc
-- brain phai qua RPC SECURITY DEFINER trong schema public.
CREATE OR REPLACE FUNCTION public.ingest_cancellation_sync_log(
  p_email_message_id TEXT,
  p_ota_booking_number TEXT,
  p_result TEXT,
  p_group_id UUID,
  p_bookings_cancelled_count INTEGER,
  p_error_message TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'brain', 'public'
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO brain.cancellation_sync_log (
    email_message_id, ota_booking_number, result, group_id, bookings_cancelled_count, error_message
  )
  VALUES (
    p_email_message_id, p_ota_booking_number, p_result, p_group_id, p_bookings_cancelled_count, p_error_message
  )
  ON CONFLICT (email_message_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN JSON_BUILD_OBJECT('id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingest_cancellation_sync_log(TEXT, TEXT, TEXT, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_cancellation_sync_log(TEXT, TEXT, TEXT, UUID, INTEGER, TEXT) TO service_role;

-- === RPC: check_cancellation_email_processed (dedupe) ===
CREATE OR REPLACE FUNCTION public.check_cancellation_email_processed(p_email_message_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'brain', 'public'
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM brain.cancellation_sync_log WHERE email_message_id = p_email_message_id) INTO v_exists;
  RETURN v_exists;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_cancellation_email_processed(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cancellation_email_processed(TEXT) TO service_role;

-- === RPC: check_arrival_email_processed (dedupe) ===
-- Fix bug: dedupe check cua arrival_check_log truoc day dung .from() truc
-- tiep tren schema brain -- KHONG BAO GIO hoat dong dung (luon tra ve rong).
CREATE OR REPLACE FUNCTION public.check_arrival_email_processed(p_email_message_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'brain', 'public'
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM brain.arrival_check_log WHERE email_message_id = p_email_message_id) INTO v_exists;
  RETURN v_exists;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_arrival_email_processed(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_arrival_email_processed(TEXT) TO service_role;
