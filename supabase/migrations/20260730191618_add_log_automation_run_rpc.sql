-- Reconstructed 2026-07-31 from live schema introspection: this migration was
-- applied directly to production (not via a local migration file), so the
-- original SQL text was never captured in git. Content below matches the
-- live function definition exactly (verified via pg_get_functiondef).
--
-- NOT related to ops-guardian: this writes automation-sourced daily-log
-- entries into brain.daily_log (category='automation'), separate from the
-- automation.* heartbeat/watchdog schema added in
-- 20260731030000_ops_guardian_stage1_schema.sql.

CREATE OR REPLACE FUNCTION public.log_automation_run(p_log_date date, p_source text, p_content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'brain', 'public'
AS $$
BEGIN
  -- Scoped theo source + category='automation'. KHONG dung
  -- upsert_brain_daily_log cho log tu dong: RPC do delete-by-category,
  -- se xoa sach moi dong cung category cua ngay (da gay mat 2 dong dev
  -- ngay 30/07/2026). Xem brain.decisions cung ngay.
  DELETE FROM brain.daily_log
  WHERE log_date = p_log_date AND source = p_source AND category = 'automation';

  INSERT INTO brain.daily_log (log_date, category, content, source)
  VALUES (p_log_date, 'automation', p_content, p_source);
END;
$$;
