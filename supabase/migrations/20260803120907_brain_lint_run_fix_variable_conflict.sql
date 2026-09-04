-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 03/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- Fix 42702: tên cột OUT (check_code, status...) trùng tên cột bảng trong UPDATE.
-- Không có biến PL/pgSQL nào trùng tên cột => ưu tiên cột là an toàn tuyệt đối.
DO $mig$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('brain.lint_run(boolean,text)'::regprocedure) INTO src;
  IF position('#variable_conflict' IN src) = 0 THEN
    src := replace(src, E'DECLARE\n', E'#variable_conflict use_column\nDECLARE\n');
    EXECUTE src;
  END IF;
END
$mig$;