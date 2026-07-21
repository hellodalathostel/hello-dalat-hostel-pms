-- upsert_brain_daily_log is SECURITY DEFINER and was callable by anon/authenticated,
-- letting anyone with the public anon key delete+overwrite any brain.daily_log entry.
-- Restrict execution to service_role only (Edge Functions / Claude via service key).
REVOKE EXECUTE ON FUNCTION public.upsert_brain_daily_log(date, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_brain_daily_log(date, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_brain_daily_log(date, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_brain_daily_log(date, text, text, text) TO service_role;
