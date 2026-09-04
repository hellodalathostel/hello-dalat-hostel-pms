-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 13/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================

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

-- RPC de check dedupe (thay the .from("cancellation_sync_log").select() qua REST khong hoat dong)
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
