-- =====================================================================
-- OPS GUARDIAN STAGE 2 — canh cheo hai chieu (dead-man's switch)
--
-- Da apply len remote luc 2026-07-31 06:47 qua Supabase MCP apply_migration.
-- File nay de dong bo lai migration history local — KHONG can chay lai.
-- Version phai giu nguyen 20260731064742 de khop supabase_migrations.schema_migrations.
--
-- Stage 1 co diem yeu: neu ops-guardian chet, khong ai bao. Viec phat hien
-- phu thuoc vao Hieu NHAN RA tin 08:00 khong den = giam sat bang tri nho
-- con nguoi, cach da that bai truoc do.
-- Stage 2: task-reminder (chay 07:30 ICT, TRUOC guardian 08:00) kiem tra
-- nguoc lai guardian. Hai job canh nhau, khong ben nao la diem chet don le.
--
-- Kem theo: list_tasks_for_date — nguon danh sach + danh so task DUY NHAT,
-- dung chung voi complete/skip/extend_task_txn de so thu tu luon khop.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) automation.peer_check — kiem tra suc khoe 1 job cu the
--    Dung nguong tu job_registry (khong hardcode), ghi alert de guardian
--    tu dong dong khi job song lai (report_run status=ok auto-resolve).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION automation.peer_check(p_job_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reg      record;
  v_last     record;
  v_issue    text;
  v_alert_id uuid;
BEGIN
  SELECT j.job_name, j.severity, j.expected_interval, j.grace_period, j.is_active
    INTO v_reg
  FROM automation.job_registry j
  WHERE j.job_name = p_job_name;

  -- Job chua dang ky = BAT THUONG, khong duoc coi la khoe.
  IF v_reg.job_name IS NULL THEN
    RETURN jsonb_build_object(
      'job_name',   p_job_name,
      'registered', false,
      'healthy',    false,
      'issue',      'not_registered',
      'checked_at', now()
    );
  END IF;

  -- Job da tat chu dich = khoe (khong canh bao).
  IF NOT v_reg.is_active THEN
    RETURN jsonb_build_object(
      'job_name',   p_job_name,
      'registered', true,
      'active',     false,
      'healthy',    true,
      'issue',      null,
      'checked_at', now()
    );
  END IF;

  SELECT r.created_at, r.status, r.error_message
    INTO v_last
  FROM automation.automation_runs r
  WHERE r.job_name = p_job_name
  ORDER BY r.created_at DESC
  LIMIT 1;

  v_issue := CASE
    WHEN v_last.created_at IS NULL THEN 'never_run'
    WHEN v_last.status = 'error'   THEN 'error'
    WHEN now() - v_last.created_at > v_reg.expected_interval + v_reg.grace_period THEN 'silent'
    ELSE NULL
  END;

  -- Ghi alert (idempotent nho unique partial index tren job_name WHERE resolved_at IS NULL)
  IF v_issue IS NOT NULL THEN
    INSERT INTO automation.guardian_alerts (job_name, alert_type)
    VALUES (p_job_name, v_issue)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_alert_id;
  END IF;

  RETURN jsonb_build_object(
    'job_name',      p_job_name,
    'registered',    true,
    'active',        true,
    'healthy',       v_issue IS NULL,
    'issue',         v_issue,
    'severity',      v_reg.severity,
    'last_run_at',   v_last.created_at,
    'silent_for',    (now() - v_last.created_at)::text,
    'threshold',     (v_reg.expected_interval + v_reg.grace_period)::text,
    'last_error',    v_last.error_message,
    'alert_created', v_alert_id IS NOT NULL,
    'checked_at',    now()
  );
END;
$$;

-- Wrapper public (PostgREST chi expose schema public)
CREATE OR REPLACE FUNCTION public.check_peer_job(p_job_name text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT automation.peer_check(p_job_name);
$$;

-- ---------------------------------------------------------------------
-- 2) public.list_tasks_for_date — danh so task khop 1:1 voi
--    complete_task_txn / skip_task_txn / extend_task_txn
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_tasks_for_date(p_task_date date)
RETURNS TABLE (
  task_number      integer,
  task_id          bigint,
  task_name        text,
  loai             text,
  priority         text,
  room_id          text,
  ghi_chu          text,
  nguoi_thuc_hien  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (ROW_NUMBER() OVER (
      ORDER BY
        CASE t.priority
          WHEN 'Khan'        THEN 0
          WHEN 'Cao'         THEN 1
          WHEN 'Binh Thuong' THEN 2
          WHEN 'Thap'        THEN 3
          ELSE 2
        END,
        t.created_at ASC
    ))::integer,
    t.id,
    t.task_name,
    t.loai,
    t.priority,
    t.room_id,
    t.ghi_chu,
    t.nguoi_thuc_hien
  FROM public.ops_tasks t
  WHERE t.task_date = p_task_date
    AND t.status = 'Can Lam'
  ORDER BY 1;
$$;

-- ---------------------------------------------------------------------
-- 3) GRANT — bai hoc 31/07: REVOKE FROM PUBLIC KHONG go duoc quyen ma
--    Supabase cap truc tiep cho anon/authenticated qua ALTER DEFAULT
--    PRIVILEGES. Phai revoke DICH DANH tung role.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION automation.peer_check(text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_peer_job(text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_tasks_for_date(date)   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION automation.peer_check(text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.check_peer_job(text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.list_tasks_for_date(date) TO service_role, authenticated;

COMMENT ON FUNCTION automation.peer_check(text) IS
  'Ops Guardian Stage 2: kiem tra suc khoe 1 job theo nguong trong job_registry, ghi alert idempotent. Dung cho canh cheo (task-reminder canh ops-guardian).';
COMMENT ON FUNCTION public.list_tasks_for_date(date) IS
  'Nguon danh so task duy nhat — khop voi complete/skip/extend_task_txn.';
