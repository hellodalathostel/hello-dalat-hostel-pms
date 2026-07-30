-- Ops Guardian — Stage 1: schema automation + heartbeat + watchdog
-- Ngay: 2026-07-31
--
-- BOI CANH / LY DO TON TAI:
-- Ngay 30/07 phat hien 2 cron job (task-reminder jobid 20, daily-revenue-summary
-- jobid 12) chet am tham 24 ngay ma khong co bat ky tin hieu nao. Nguyen nhan goc
-- KHONG phai thieu monitoring tool, ma la ha tang san co KHONG THE giam sat duoc:
--
--   1. cron.job_run_details LUON bao 'succeeded'. Vi net.http_post la ASYNC —
--      no chi day request vao hang doi roi tra request_id ngay lap tuc. Lenh SQL
--      thanh cong bat ke HTTP sau do tra 401/500/timeout. Kiem chung 30/07:
--      6/6 job 'succeeded' 100% trong 3 ngay, dung giai doan job dang chet.
--      return_message chi ghi '1 row', KHONG chua request_id de truy vet.
--
--   2. net._http_response CO status_code that, nhung retention ~6 gio / 10 record
--      (pg_net tu don), va KHONG co cot nao map ve jobid hay URL.
--
-- => Bat buoc moi Edge Function TU BAO CAO (heartbeat). Chi can ghi heartbeat khi
--    chay XONG THANH CONG: moi kieu chet (401 gateway khien function khong he chay,
--    crash giua chung, OAuth fail) deu bieu hien chung la KHONG CO HEARTBEAT.
--    Watchdog chi can phat hien "im lang qua lau" — moi function chi them ~3 dong.
--
-- KIEN TRUC:
--   automation.job_registry     — khai bao job nao can giam sat + duoc im lang bao lau
--   automation.automation_runs  — heartbeat, Edge Function ghi khi chay xong
--   automation.guardian_alerts  — chong spam, nho da bao roi thi khong bao lai
--   public.* wrapper            — PostgREST CHI expose schema public, nen Edge Function
--                                 khong goi truc tiep automation.* duoc. Dung dung pattern
--                                 da co cua du an (upsert_brain_daily_log o public, ghi vao brain).
--
-- LUU Y SEED: CHI dang ky 2 job (task-reminder, ops-guardian) o stage 1. KHONG seed
-- ca 12 cron job — job chua duoc gan heartbeat se bi bao 'never_run' ngay lap tuc,
-- tao spam vo nghia. Them dan tung job vao job_registry SAU KHI da gan heartbeat
-- vao Edge Function tuong ung.

-- ============================================================
-- SCHEMA
-- ============================================================
CREATE SCHEMA IF NOT EXISTS automation;
GRANT USAGE ON SCHEMA automation TO authenticated, service_role;

-- ============================================================
-- 1. job_registry — khai bao job can giam sat
-- ============================================================
CREATE TABLE automation.job_registry (
  job_name          text PRIMARY KEY,
  description       text,
  -- Khoang thoi gian toi da duoc phep im lang giua 2 lan chay thanh cong
  expected_interval interval NOT NULL,
  -- Bien do du phong, tranh bao dong gia khi job chay tre vai phut
  grace_period      interval NOT NULL DEFAULT '30 minutes',
  severity          text NOT NULL DEFAULT 'Cao'
                    CHECK (severity IN ('Khan','Cao','Binh Thuong')),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE automation.job_registry ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON automation.job_registry TO authenticated;
GRANT ALL    ON automation.job_registry TO service_role;

-- Owner + Staff deu doc duoc (theo data access model da chot 2026-06-18:
-- khong phan quyen chi tiet o hostel 1 staff). Ghi chi qua service_role/RPC.
CREATE POLICY job_registry_select_auth
  ON automation.job_registry FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 2. automation_runs — heartbeat
-- ============================================================
CREATE TABLE automation.automation_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name      text NOT NULL REFERENCES automation.job_registry(job_name) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('ok','error')),
  duration_ms   integer,
  detail        jsonb,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_runs_job_time
  ON automation.automation_runs (job_name, created_at DESC);

ALTER TABLE automation.automation_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON automation.automation_runs TO authenticated;
GRANT ALL    ON automation.automation_runs TO service_role;

CREATE POLICY automation_runs_select_auth
  ON automation.automation_runs FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 3. guardian_alerts — chong spam alert
-- ============================================================
CREATE TABLE automation.guardian_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name    text NOT NULL REFERENCES automation.job_registry(job_name) ON DELETE CASCADE,
  alert_type  text NOT NULL CHECK (alert_type IN ('silent','error','never_run')),
  alerted_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Moi job chi co toi da 1 alert dang mo tai 1 thoi diem
CREATE UNIQUE INDEX idx_guardian_alerts_one_open
  ON automation.guardian_alerts (job_name) WHERE resolved_at IS NULL;

ALTER TABLE automation.guardian_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON automation.guardian_alerts TO authenticated;
GRANT ALL    ON automation.guardian_alerts TO service_role;

CREATE POLICY guardian_alerts_select_auth
  ON automation.guardian_alerts FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 4. automation.report_run — Edge Function ghi heartbeat
-- ============================================================
CREATE OR REPLACE FUNCTION automation.report_run(
  p_job_name      text,
  p_status        text DEFAULT 'ok',
  p_duration_ms   integer DEFAULT NULL,
  p_detail        jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM automation.job_registry r
    WHERE r.job_name = p_job_name AND r.is_active
  ) THEN
    RAISE EXCEPTION 'UNKNOWN_JOB: % chua dang ky hoac da tat trong automation.job_registry', p_job_name
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO automation.automation_runs (job_name, status, duration_ms, detail, error_message)
  VALUES (p_job_name, p_status, p_duration_ms, p_detail, p_error_message)
  RETURNING id INTO v_id;

  -- Chay lai thanh cong => tu dong dong alert dang mo (khong can can thiep tay)
  IF p_status = 'ok' THEN
    UPDATE automation.guardian_alerts
    SET resolved_at = now()
    WHERE job_name = p_job_name AND resolved_at IS NULL;
  END IF;

  RETURN v_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION automation.report_run(text,text,integer,jsonb,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION automation.report_run(text,text,integer,jsonb,text) TO service_role;

-- ============================================================
-- 5. automation.check_job_health — job nao dang co van de
-- ============================================================
CREATE OR REPLACE FUNCTION automation.check_job_health()
RETURNS TABLE (
  out_job_name    text,
  out_severity    text,
  out_issue       text,
  out_last_run_at timestamptz,
  out_silent_for  interval,
  out_last_error  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH last_run AS (
    SELECT DISTINCT ON (r.job_name)
      r.job_name, r.created_at, r.status, r.error_message
    FROM automation.automation_runs r
    ORDER BY r.job_name, r.created_at DESC
  )
  SELECT
    j.job_name,
    j.severity,
    CASE
      WHEN lr.job_name IS NULL   THEN 'never_run'
      WHEN lr.status  = 'error'  THEN 'error'
      ELSE 'silent'
    END,
    lr.created_at,
    now() - lr.created_at,
    lr.error_message
  FROM automation.job_registry j
  LEFT JOIN last_run lr ON lr.job_name = j.job_name
  WHERE j.is_active
    AND (
      lr.job_name IS NULL
      OR lr.status = 'error'
      OR now() - lr.created_at > j.expected_interval + j.grace_period
    );
$fn$;

REVOKE EXECUTE ON FUNCTION automation.check_job_health() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION automation.check_job_health() TO service_role, authenticated;

-- ============================================================
-- 6. automation.guardian_scan — toan bo logic chong spam nam o DB
--    Edge Function chi goi 1 RPC nay va gui Telegram (nguyen tac #4:
--    Edge Function chi lam I/O, khong duplicate logic DB).
--
--    Tra ve jsonb:
--      new_alerts  = job co van de VA chua tung duoc bao (can nhan NGAY)
--      all_issues  = toan bo job dang co van de (dung cho bao cao sang)
--      ok_count    = so job dang khoe
-- ============================================================
CREATE OR REPLACE FUNCTION automation.guardian_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_new_alerts jsonb;
  v_all_issues jsonb;
  v_ok_count   integer;
BEGIN
  -- Ghi alert moi cho nhung job co van de ma chua co alert dang mo.
  -- ON CONFLICT DO NOTHING dua vao unique index idx_guardian_alerts_one_open.
  WITH issues AS (
    SELECT * FROM automation.check_job_health()
  ), inserted AS (
    INSERT INTO automation.guardian_alerts (job_name, alert_type)
    SELECT i.out_job_name, i.out_issue FROM issues i
    ON CONFLICT DO NOTHING
    RETURNING job_name
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_new_alerts
  FROM (
    SELECT i.out_job_name AS job_name, i.out_severity AS severity, i.out_issue AS issue,
           i.out_last_run_at AS last_run_at, i.out_silent_for::text AS silent_for,
           i.out_last_error AS last_error
    FROM automation.check_job_health() i
    WHERE i.out_job_name IN (SELECT job_name FROM inserted)
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(y)), '[]'::jsonb) INTO v_all_issues
  FROM (
    SELECT i.out_job_name AS job_name, i.out_severity AS severity, i.out_issue AS issue,
           i.out_last_run_at AS last_run_at, i.out_silent_for::text AS silent_for,
           i.out_last_error AS last_error
    FROM automation.check_job_health() i
  ) y;

  SELECT count(*)::integer INTO v_ok_count
  FROM automation.job_registry j
  WHERE j.is_active
    AND j.job_name NOT IN (SELECT i.out_job_name FROM automation.check_job_health() i);

  RETURN jsonb_build_object(
    'new_alerts', v_new_alerts,
    'all_issues', v_all_issues,
    'ok_count',   v_ok_count,
    'scanned_at', now()
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION automation.guardian_scan() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION automation.guardian_scan() TO service_role;

-- ============================================================
-- 7. WRAPPER trong public — PostgREST chi expose schema public
-- ============================================================
CREATE OR REPLACE FUNCTION public.report_automation_run(
  p_job_name      text,
  p_status        text DEFAULT 'ok',
  p_duration_ms   integer DEFAULT NULL,
  p_detail        jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $w$
  SELECT automation.report_run(p_job_name, p_status, p_duration_ms, p_detail, p_error_message);
$w$;

REVOKE EXECUTE ON FUNCTION public.report_automation_run(text,text,integer,jsonb,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.report_automation_run(text,text,integer,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.guardian_scan()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $w$
  SELECT automation.guardian_scan();
$w$;

REVOKE EXECUTE ON FUNCTION public.guardian_scan() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.guardian_scan() TO service_role;

-- Doc-only, cho phep PMS frontend hien trang thai sau nay
CREATE OR REPLACE FUNCTION public.check_automation_health()
RETURNS TABLE (
  job_name    text,
  severity    text,
  issue       text,
  last_run_at timestamptz,
  silent_for  interval,
  last_error  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $w$
  SELECT * FROM automation.check_job_health();
$w$;

REVOKE EXECUTE ON FUNCTION public.check_automation_health() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_automation_health() TO service_role, authenticated;

-- ============================================================
-- 8. SEED — chi 2 job o stage 1 (xem LUU Y SEED o dau file)
-- ============================================================
INSERT INTO automation.job_registry (job_name, description, expected_interval, grace_period, severity) VALUES
  ('task-reminder',
   'Nhac viec hang ngay cho Loi qua Telegram (cron jobid 20, 00:30 ICT)',
   '1 day',   '2 hours', 'Cao'),
  ('ops-guardian',
   'Watchdog giam sat cac job khac + bao cao sang 08:00 ICT (cron moi 6 gio)',
   '6 hours', '1 hour',  'Khan')
ON CONFLICT (job_name) DO NOTHING;

-- ============================================================
-- VERIFY SAU KHI PUSH (chay tay, KHONG nam trong migration):
--
--   -- 1. Grant dung chua (apply thanh cong KHONG dam bao grant dung — bai hoc Brain)
--   SELECT has_function_privilege('service_role','public.guardian_scan()','EXECUTE') AS svc_scan,
--          has_function_privilege('service_role','public.report_automation_run(text,text,integer,jsonb,text)','EXECUTE') AS svc_report,
--          has_function_privilege('anon','public.guardian_scan()','EXECUTE') AS anon_scan_must_be_false;
--
--   -- 2. RLS da bat tren ca 3 bang
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relnamespace = 'automation'::regnamespace AND relkind = 'r';
--
--   -- 3. Scan lan dau — ky vong: ca 2 job deu 'never_run' (chua gan heartbeat)
--   SELECT public.guardian_scan();
-- ============================================================
