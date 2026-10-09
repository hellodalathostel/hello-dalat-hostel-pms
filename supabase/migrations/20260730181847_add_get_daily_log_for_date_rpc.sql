CREATE OR REPLACE FUNCTION public.get_daily_log_for_date(p_date date)
RETURNS TABLE(category text, content text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT category, content, created_at
  FROM brain.daily_log
  WHERE log_date = p_date
  ORDER BY created_at;
$$;

REVOKE ALL ON FUNCTION public.get_daily_log_for_date(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_log_for_date(date) TO service_role;
