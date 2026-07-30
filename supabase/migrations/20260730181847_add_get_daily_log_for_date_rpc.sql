-- Reconstructed 2026-07-31 from live schema introspection: this migration was
-- applied directly to production (not via a local migration file), so the
-- original SQL text was never captured in git. The unrestricted (pre-filter)
-- version is inferred from intent — see 20260730181910 which added the
-- category restriction on top of this. Final state was verified byte-for-byte
-- against the live function definition (pg_get_functiondef).

CREATE OR REPLACE FUNCTION public.get_daily_log_for_date(p_date date)
RETURNS TABLE (category text, content text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT category, content, created_at
  FROM brain.daily_log
  WHERE log_date = p_date
  ORDER BY created_at;
$$;
