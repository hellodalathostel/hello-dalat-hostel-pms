-- Migration 02: security-only cho 5 view con ho anon
--
-- SCOPE DA SUA theo review cua Hieu: chi 5 view, KHONG dung dashboard_today
-- (da an toan tu truoc - security_invoker=true, anon revoked, thuoc nhanh
-- checkout RPC rollout 2026-07-17). Ban 02 goc mo ta 6 view la sai, verify
-- lai truc tiep xac nhan dashboard_today khong can dong toi.
--
-- 5 view can xu ly: dk14_luu_tru, finance_monthly_revenue, monthly_revenue,
-- room_calendar, v_s1a_hkd - tat ca hien anon SELECT = true.
--
-- CHI xu ly phan bao mat (security_invoker + revoke anon) trong migration nay.
-- v_s1a_hkd doi logic nghiep vu (actual_check_out) la Migration 02b RIENG,
-- dang TAM DUNG cho reconciliation - KHONG dong vao logic view o day.
--
-- authenticated GIU NGUYEN quyen SELECT - PMS frontend dang doc cac view nay
-- qua session authenticated, khong duoc lam gian doan.

BEGIN;

ALTER VIEW public.dk14_luu_tru SET (security_invoker = true);
REVOKE ALL ON public.dk14_luu_tru FROM PUBLIC, anon;

ALTER VIEW public.finance_monthly_revenue SET (security_invoker = true);
REVOKE ALL ON public.finance_monthly_revenue FROM PUBLIC, anon;

ALTER VIEW public.monthly_revenue SET (security_invoker = true);
REVOKE ALL ON public.monthly_revenue FROM PUBLIC, anon;

ALTER VIEW public.room_calendar SET (security_invoker = true);
REVOKE ALL ON public.room_calendar FROM PUBLIC, anon;

ALTER VIEW public.v_s1a_hkd SET (security_invoker = true);
REVOKE ALL ON public.v_s1a_hkd FROM PUBLIC, anon;

COMMIT;

-- VERIFY sau khi apply:
-- SELECT relname,
--   has_table_privilege('anon', ('public.'||relname)::regclass, 'SELECT') AS anon_select,
--   has_table_privilege('authenticated', ('public.'||relname)::regclass, 'SELECT') AS auth_select
-- FROM pg_class
-- WHERE relname IN ('dk14_luu_tru','finance_monthly_revenue','monthly_revenue','room_calendar','v_s1a_hkd')
--   AND relkind='v';
-- Ky vong: anon_select = false (ca 5), auth_select = true (ca 5)

-- SMOKE-TEST SAU APPLY: mo PMS (session authenticated), kiem tra cac man hinh
-- dung dk14_luu_tru / finance_monthly_revenue / monthly_revenue / room_calendar /
-- v_s1a_hkd van hien du lieu binh thuong (khong bi 401/403/rong).
