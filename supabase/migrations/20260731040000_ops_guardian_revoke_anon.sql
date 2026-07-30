-- HOTFIX BAO MAT: revoke anon tren cac RPC automation
-- Ngay: 2026-07-31
--
-- PHAT HIEN: sau khi push 20260731030000_ops_guardian_stage1_schema.sql,
-- buoc verify bang has_function_privilege() cho thay anon VAN co EXECUTE tren
-- public.guardian_scan(), public.report_automation_run(), public.check_automation_health()
-- MAC DU migration da co REVOKE EXECUTE ... FROM PUBLIC.
--
-- NGUYEN NHAN GOC: Supabase cau hinh san ALTER DEFAULT PRIVILEGES cap EXECUTE cho
-- anon va authenticated tren MOI function moi tao trong schema public. REVOKE FROM
-- PUBLIC chi go quyen cap qua pseudo-role PUBLIC, KHONG go quyen cap TRUC TIEP cho
-- anon/authenticated. => Bat buoc revoke DICH DANH tung role.
--
-- MUC DO NGHIEM TRONG: khai thac duoc that. Wrapper trong public la SECURITY DEFINER
-- nen chay bang quyen owner, xuyen qua moi rao chan ben trong (anon khong co USAGE
-- tren schema automation cung khong can). anon key nam cong khai trong frontend bundle.
-- Ke tan cong co the goi report_automation_run('task-reminder','ok') de ghi HEARTBEAT GIA,
-- khien guardian tuong job khoe trong khi no da chet => vo hieu hoa dung cai he thong
-- vua dung len de chong. Khong lo PII khach, nhung pha tinh toan ven giam sat.
--
-- BAI HOC (da co trong Brain, lan nay xac nhan bang su co that):
--   "always verify grants with has_function_privilege() after applying —
--    apply thanh cong KHONG confirm correct grant state"
-- Buoc verify nay chinh la thu da bat duoc lo hong. KHONG BAO GIO bo qua no.
--
-- PHAM VI: gom ca public.log_automation_run (tao 30/07, ghi brain.daily_log) —
-- KHONG thuoc migration ops-guardian nhung dinh CUNG MOT benh, anon ghi rac vao
-- Brain duoc. Day la pattern he thong, khong phai su co don le.

-- ============================================================
-- 1. guardian_scan — chi service_role
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.guardian_scan() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.guardian_scan() TO service_role;

-- ============================================================
-- 2. report_automation_run — chi service_role
--    (quan trong nhat: day la duong ghi heartbeat gia)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.report_automation_run(text,text,integer,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.report_automation_run(text,text,integer,jsonb,text)
  TO service_role;

-- ============================================================
-- 3. check_automation_health — doc-only, GIU authenticated
--    (de PMS frontend hien trang thai job sau nay), chi bo anon
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.check_automation_health() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_automation_health() TO service_role, authenticated;

-- ============================================================
-- 4. log_automation_run — ghi brain.daily_log, chi service_role
--    (function co san tu 30/07, dinh cung benh default privileges)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.log_automation_run(date,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.log_automation_run(date,text,text)
  TO service_role;

-- ============================================================
-- VERIFY SAU KHI PUSH (chay tay — bat buoc, khong duoc bo qua):
--
--   SELECT
--     has_function_privilege('anon','public.guardian_scan()','EXECUTE')            AS a1_must_be_false,
--     has_function_privilege('anon','public.report_automation_run(text,text,integer,jsonb,text)','EXECUTE') AS a2_must_be_false,
--     has_function_privilege('anon','public.check_automation_health()','EXECUTE')  AS a3_must_be_false,
--     has_function_privilege('anon','public.log_automation_run(date,text,text)','EXECUTE') AS a4_must_be_false,
--     has_function_privilege('service_role','public.guardian_scan()','EXECUTE')    AS s1_must_be_true,
--     has_function_privilege('service_role','public.report_automation_run(text,text,integer,jsonb,text)','EXECUTE') AS s2_must_be_true,
--     has_function_privilege('authenticated','public.check_automation_health()','EXECUTE') AS auth_health_must_be_true;
--
-- Ky vong: 4 cot dau FALSE, 3 cot sau TRUE.
-- ============================================================

-- ============================================================
-- CON TON DONG — CAN HIEU QUYET DINH RIENG (khong xu ly trong migration nay):
--
-- 3 RPC sau anon cung goi duoc, nhung CO THE LA CO Y (landing page cong khai
-- hellodalathostel.com goi truc tiep PostgREST bang anon key de check phong trong
-- va bao gia). Khong tu y revoke vi co the lam vo chuc nang dat phong tren landing:
--   - public.check_room_availability
--   - public.get_suggested_price
--   - public.get_daily_log_for_date   <-- cai nay DANG NGO nhat, lo thong tin van hanh
--                                          noi bo, kho hinh dung ly do landing can
--
-- Cac RPC tien/booking quan trong (create_group_booking_txn, record_payment_txn,
-- checkin/checkout_booking_txn...) DA kiem tra: anon KHONG goi duoc. Known-issue
-- "anon RPC security gap" dong 2026-07-07 van giu nguyen hieu luc.
--
-- DE XUAT: kiem tra dinh ky bang query nay (them vao checklist thang cung voi
-- kiem tra migration drift):
--
--   SELECT p.proname FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
--   WHERE n.nspname = 'public' AND p.prokind = 'f' AND d.objid IS NULL
--     AND has_function_privilege('anon', p.oid, 'EXECUTE')
--   ORDER BY p.proname;
-- ============================================================
