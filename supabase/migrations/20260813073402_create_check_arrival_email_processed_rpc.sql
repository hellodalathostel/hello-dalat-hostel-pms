-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 13/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================

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
