-- RLS/grant hardening (audit 09/11/2026)
-- 1) Thu hồi TRUNCATE/TRIGGER/REFERENCES của authenticated + anon trên mọi bảng public
--    (RLS không chặn TRUNCATE; app không cần các quyền này).
-- 2) Đổi default privileges để bảng MỚI không tự được cấp lại 3 quyền này.
-- 3) Ghim search_path cho các hàm public còn "mutable" (không đổi ACL, không đổi logic).
-- Không đụng service_role. Không đổi policy. Không đổi signature RPC nào.

BEGIN;

-- 1) Thu hồi quyền nguy hiểm trên bảng hiện có
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated, anon;

-- 2) Default privileges cho bảng tạo sau này (theo owner postgres)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated, anon;

-- 3) Ghim search_path (tra theo tên để không phụ thuộc signature)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('check_room_availability','get_suggested_price','update_updated_at_column',
                        'set_updated_at','set_room_dirty_on_checkout','generate_booking_code',
                        'set_ops_tasks_updated_at','calc_booking_grand_total')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND p.proconfig IS NULL
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
  END LOOP;
END $$;

COMMIT;

-- ===== KIỂM TRA SAU APPLY (chạy tay, kỳ vọng 0 dòng) =====
-- SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema='public' AND grantee IN ('authenticated','anon')
--    AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES');
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname IN ('check_room_availability','get_suggested_price','calc_booking_grand_total')
--    AND p.proconfig IS NULL;
-- ACL hàm: has_function_privilege('anon', oid, 'EXECUTE') phải false cho mọi hàm SECURITY DEFINER.

-- ===== ROLLBACK THỦ CÔNG (nếu cần) =====
-- GRANT TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLES TO authenticated;
-- ALTER FUNCTION public.<ten>(<args>) RESET search_path;
