-- Reconstructed 2026-07-31 from live schema introspection: this migration was
-- applied directly to production (not via a local migration file), so the
-- original SQL text was never captured in git. Content below matches the
-- live function definition exactly (verified via pg_get_functiondef).

CREATE OR REPLACE FUNCTION public.get_daily_log_for_date(p_date date)
RETURNS TABLE (category text, content text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT category, content, created_at
  FROM brain.daily_log
  WHERE log_date = p_date
    AND category IN ('incident','maintenance','guest','operational')
  ORDER BY created_at;
$$;
