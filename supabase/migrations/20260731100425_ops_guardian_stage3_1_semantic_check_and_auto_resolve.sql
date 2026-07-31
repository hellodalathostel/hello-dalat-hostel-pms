-- Stage 3.1: heartbeat chung minh job CHAY, semantic check chung minh job LAM DUNG.
-- Gop them auto-resolve: index idx_guardian_alerts_one_open chi cho 1 alert mo/job,
-- alert khong bao gio dong => alert moi bi ON CONFLICT DO NOTHING nuot.

-- ============ 1. Registry: con tro toi validator ============
ALTER TABLE automation.job_registry ADD COLUMN IF NOT EXISTS semantic_validator text;

COMMENT ON COLUMN automation.job_registry.semantic_validator IS
  'Ten function trong schema automation, dang semantic_<job>, chu ky (jsonb, timestamptz) -> jsonb. NULL = job chi co heartbeat.';

-- ============ 2. Alert type moi ============
ALTER TABLE automation.guardian_alerts DROP CONSTRAINT IF EXISTS guardian_alerts_alert_type_check;
ALTER TABLE automation.guardian_alerts ADD CONSTRAINT guardian_alerts_alert_type_check
  CHECK (alert_type = ANY (ARRAY['silent','error','never_run','semantic_fail']));

-- ============ 3. Validator cho task-reminder ============
CREATE OR REPLACE FUNCTION automation.semantic_task_reminder(p_detail jsonb, p_run_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_task_date date; v_expected integer; v_actual integer;
BEGIN
  -- Ngay ma run do le ra phai nhac, tinh theo gio VN chu khong phai UTC
  v_task_date := (p_run_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  -- Contract: task-reminder BAT BUOC ghi key tasks_sent. Thieu key = unknown, KHONG alert.
  IF p_detail IS NULL OR NOT (p_detail ? 'tasks_sent') THEN
    RETURN jsonb_build_object('validator','semantic_task_reminder','verdict','unknown',
      'reason','missing_key_tasks_sent','task_date',v_task_date,'detail',p_detail);
  END IF;

  v_actual := (p_detail->>'tasks_sent')::integer;

  -- Chi dem task da ton tai TRUOC luc job chay va den gio van chua xong.
  -- Status monotonic (xac nhan 2026-07-31): chi task_date thay doi, status khong quay ve 'Can Lam'.
  SELECT count(*)::integer INTO v_expected FROM public.ops_tasks t
  WHERE t.task_date = v_task_date AND t.created_at <= p_run_at
    AND t.status IN ('Can Lam','Dang Lam');

  -- Chi FAIL o ca bang chung khong the choi cai: con viec ma gui 0.
  -- KHONG so actual >= expected: task xong truoc 07:30 hoac tao them sau 07:30
  -- deu lam undercount hop le -> se bao dong gia.
  IF v_expected > 0 AND v_actual = 0 THEN
    RETURN jsonb_build_object('validator','semantic_task_reminder','verdict','fail',
      'reason','silent_zero','task_date',v_task_date,'expected_min',v_expected,'actual',v_actual,
      'message', format('Job bao ok nhung gui 0 task, trong khi con it nhat %s task chua xong ngay %s', v_expected, v_task_date));
  END IF;

  RETURN jsonb_build_object('validator','semantic_task_reminder','verdict','pass',
    'task_date',v_task_date,'expected_min',v_expected,'actual',v_actual);
END; $fn$;

-- ============ 4. Verdict THUAN DOC (khong side-effect) ============
-- Tach rieng de auto-resolve dung duoc ma khong vo tinh tao alert.
CREATE OR REPLACE FUNCTION automation.semantic_verdict(p_job_name text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_validator text; v_run record; v_res jsonb;
BEGIN
  SELECT j.semantic_validator INTO v_validator FROM automation.job_registry j
  WHERE j.job_name = p_job_name AND j.is_active;

  IF v_validator IS NULL THEN
    RETURN jsonb_build_object('job_name',p_job_name,'semantic_enabled',false,'verdict','skipped','checked_at',now());
  END IF;

  -- Chan dynamic SQL: ten dung chuan VA function ton tai dung chu ky
  IF v_validator !~ '^semantic_[a-z0-9_]+$'
     OR to_regprocedure('automation.'||quote_ident(v_validator)||'(jsonb, timestamp with time zone)') IS NULL THEN
    RETURN jsonb_build_object('job_name',p_job_name,'semantic_enabled',true,'verdict','unknown',
      'reason','validator_not_found','validator',v_validator,'checked_at',now());
  END IF;

  SELECT r.id, r.detail, r.created_at INTO v_run FROM automation.automation_runs r
  WHERE r.job_name = p_job_name ORDER BY r.created_at DESC LIMIT 1;

  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('job_name',p_job_name,'semantic_enabled',true,'verdict','unknown','reason','no_run','checked_at',now());
  END IF;

  EXECUTE format('SELECT automation.%I($1, $2)', v_validator) INTO v_res USING v_run.detail, v_run.created_at;

  RETURN jsonb_build_object('job_name',p_job_name,'semantic_enabled',true,'run_id',v_run.id,
    'run_at',v_run.created_at,'verdict',v_res->>'verdict','result',v_res,'checked_at',now());
END; $fn$;

-- ============ 5. Runner: verdict + tao alert neu fail ============
CREATE OR REPLACE FUNCTION automation.run_semantic_check(p_job_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_res jsonb; v_alert_id uuid;
BEGIN
  v_res := automation.semantic_verdict(p_job_name);
  IF v_res->>'verdict' = 'fail' THEN
    INSERT INTO automation.guardian_alerts (job_name, alert_type)
    VALUES (p_job_name,'semantic_fail') ON CONFLICT DO NOTHING RETURNING id INTO v_alert_id;
  END IF;
  RETURN v_res || jsonb_build_object('alert_created', v_alert_id IS NOT NULL);
END; $fn$;

-- ============ 6. Scan semantic: chi cho job da PASS heartbeat ============
CREATE OR REPLACE FUNCTION automation.semantic_scan()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_job record; v_results jsonb := '[]'::jsonb;
BEGIN
  FOR v_job IN
    SELECT j.job_name FROM automation.job_registry j
    WHERE j.is_active AND j.semantic_validator IS NOT NULL
      -- Heartbeat fail thi detail cu vo nghia, va index 1-alert-mo se nuot alert
      AND j.job_name NOT IN (SELECT h.out_job_name FROM automation.check_job_health() h)
    ORDER BY j.job_name
  LOOP
    v_results := v_results || jsonb_build_array(automation.run_semantic_check(v_job.job_name));
  END LOOP;
  RETURN jsonb_build_object('checked', jsonb_array_length(v_results),
    'failed',(SELECT count(*) FROM jsonb_array_elements(v_results) e WHERE e->>'verdict'='fail'),
    'unknown',(SELECT count(*) FROM jsonb_array_elements(v_results) e WHERE e->>'verdict'='unknown'),
    'results', v_results, 'scanned_at', now());
END; $fn$;

-- ============ 7. Auto-resolve ============
-- p_unhealthy NULL = tu tinh (goi tay). Truyen mang vao = dung snapshot cua lugt quet do.
CREATE OR REPLACE FUNCTION automation.resolve_healthy_alerts(p_unhealthy text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_unhealthy text[]; v_resolved jsonb;
BEGIN
  IF p_unhealthy IS NULL THEN
    SELECT COALESCE(array_agg(DISTINCT s.job_name), ARRAY[]::text[]) INTO v_unhealthy FROM (
      SELECT h.out_job_name AS job_name FROM automation.check_job_health() h
      UNION
      SELECT j.job_name FROM automation.job_registry j
      WHERE j.is_active AND j.semantic_validator IS NOT NULL
        AND (automation.semantic_verdict(j.job_name)->>'verdict') = 'fail'
    ) s;
  ELSE
    v_unhealthy := p_unhealthy;
  END IF;

  WITH done AS (
    UPDATE automation.guardian_alerts a SET resolved_at = now()
    WHERE a.resolved_at IS NULL AND NOT (a.job_name = ANY (v_unhealthy))
    RETURNING a.job_name, a.alert_type, a.alerted_at, now() - a.alerted_at AS open_for
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('job_name',d.job_name,'alert_type',d.alert_type,
    'alerted_at',d.alerted_at,'open_for',d.open_for::text)),'[]'::jsonb) INTO v_resolved FROM done d;

  RETURN jsonb_build_object('resolved_count', jsonb_array_length(v_resolved),
    'resolved', v_resolved, 'resolved_at', now());
END; $fn$;

-- ============ 8. guardian_scan: 1 snapshot, 5 buoc ============
-- Giu nguyen key new_alerts / all_issues / ok_count de khong vo Edge Function dang chay.
CREATE OR REPLACE FUNCTION automation.guardian_scan()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_all_issues jsonb; v_new_alert_jobs jsonb; v_new_alerts jsonb;
  v_semantic jsonb; v_resolved jsonb; v_unhealthy text[]; v_ok_count integer;
BEGIN
  -- B1: snapshot heartbeat (goi check_job_health MOT lan duy nhat)
  SELECT COALESCE(jsonb_agg(to_jsonb(y)),'[]'::jsonb) INTO v_all_issues FROM (
    SELECT h.out_job_name AS job_name, h.out_severity AS severity, h.out_issue AS issue,
           h.out_last_run_at AS last_run_at, h.out_silent_for::text AS silent_for,
           h.out_last_error AS last_error
    FROM automation.check_job_health() h) y;

  -- B2: tao alert heartbeat (idempotent nho idx_guardian_alerts_one_open)
  WITH ins AS (
    INSERT INTO automation.guardian_alerts (job_name, alert_type)
    SELECT e->>'job_name', e->>'issue' FROM jsonb_array_elements(v_all_issues) e
    ON CONFLICT DO NOTHING RETURNING job_name)
  SELECT COALESCE(jsonb_agg(i.job_name),'[]'::jsonb) INTO v_new_alert_jobs FROM ins i;

  SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) INTO v_new_alerts
  FROM jsonb_array_elements(v_all_issues) e
  WHERE e->>'job_name' IN (SELECT jsonb_array_elements_text(v_new_alert_jobs));

  -- B3+B4: semantic cho job da pass heartbeat, tu tao alert semantic_fail
  v_semantic := automation.semantic_scan();

  -- B5: resolve tren dung snapshot cua lugt nay
  SELECT COALESCE(array_agg(DISTINCT s.job_name), ARRAY[]::text[]) INTO v_unhealthy FROM (
    SELECT e->>'job_name' AS job_name FROM jsonb_array_elements(v_all_issues) e
    UNION
    SELECT r->>'job_name' FROM jsonb_array_elements(v_semantic->'results') r WHERE r->>'verdict'='fail') s;

  v_resolved := automation.resolve_healthy_alerts(v_unhealthy);

  SELECT count(*)::integer INTO v_ok_count FROM automation.job_registry j
  WHERE j.is_active AND NOT (j.job_name = ANY (v_unhealthy));

  RETURN jsonb_build_object('new_alerts',v_new_alerts,'all_issues',v_all_issues,
    'semantic',v_semantic,'resolved',v_resolved,'ok_count',v_ok_count,'scanned_at',now());
END; $fn$;

-- ============ 9. peer_check: them semantic + resolve cho 1 job ============
CREATE OR REPLACE FUNCTION automation.peer_check(p_job_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_reg record; v_last record; v_issue text; v_alert_id uuid;
  v_sem jsonb := NULL; v_healthy boolean;
BEGIN
  SELECT j.job_name, j.severity, j.expected_interval, j.grace_period, j.is_active INTO v_reg
  FROM automation.job_registry j WHERE j.job_name = p_job_name;

  -- Job chua dang ky = BAT THUONG, khong duoc coi la khoe.
  IF v_reg.job_name IS NULL THEN
    RETURN jsonb_build_object('job_name',p_job_name,'registered',false,'healthy',false,
      'issue','not_registered','checked_at',now());
  END IF;

  -- Job da tat chu dich = khoe, va dong alert cu neu con.
  IF NOT v_reg.is_active THEN
    UPDATE automation.guardian_alerts a SET resolved_at = now()
    WHERE a.job_name = p_job_name AND a.resolved_at IS NULL;
    RETURN jsonb_build_object('job_name',p_job_name,'registered',true,'active',false,
      'healthy',true,'issue',null,'checked_at',now());
  END IF;

  SELECT r.created_at, r.status, r.error_message INTO v_last FROM automation.automation_runs r
  WHERE r.job_name = p_job_name ORDER BY r.created_at DESC LIMIT 1;

  v_issue := CASE
    WHEN v_last.created_at IS NULL THEN 'never_run'
    WHEN v_last.status = 'error'   THEN 'error'
    WHEN now() - v_last.created_at > v_reg.expected_interval + v_reg.grace_period THEN 'silent'
    ELSE NULL
  END;

  -- Semantic chi co nghia khi heartbeat da pass
  IF v_issue IS NULL THEN
    v_sem := automation.run_semantic_check(p_job_name);
    IF v_sem->>'verdict' = 'fail' THEN
      v_issue := 'semantic_fail';
    END IF;
  END IF;

  v_healthy := v_issue IS NULL;

  -- semantic_fail da duoc run_semantic_check insert roi, khong insert lai
  IF v_issue IS NOT NULL AND v_issue <> 'semantic_fail' THEN
    INSERT INTO automation.guardian_alerts (job_name, alert_type)
    VALUES (p_job_name, v_issue) ON CONFLICT DO NOTHING RETURNING id INTO v_alert_id;
  END IF;

  -- Khoe tro lai -> dong alert dang mo cua chinh job nay
  IF v_healthy THEN
    UPDATE automation.guardian_alerts a SET resolved_at = now()
    WHERE a.job_name = p_job_name AND a.resolved_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'job_name',p_job_name,'registered',true,'active',true,'healthy',v_healthy,'issue',v_issue,
    'severity',v_reg.severity,'last_run_at',v_last.created_at,
    'silent_for',(now() - v_last.created_at)::text,
    'threshold',(v_reg.expected_interval + v_reg.grace_period)::text,
    'last_error',v_last.error_message,'semantic',v_sem,
    'alert_created', v_alert_id IS NOT NULL OR COALESCE((v_sem->>'alert_created')::boolean, false),
    'checked_at',now());
END; $fn$;

-- ============ 10. Bat semantic cho task-reminder ============
UPDATE automation.job_registry SET semantic_validator='semantic_task_reminder', updated_at=now()
WHERE job_name='task-reminder';

-- ============ 11. Grants ============
REVOKE EXECUTE ON FUNCTION automation.semantic_task_reminder(jsonb, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION automation.semantic_verdict(text)                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION automation.run_semantic_check(text)                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION automation.semantic_scan()                            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION automation.resolve_healthy_alerts(text[])             FROM PUBLIC;

GRANT EXECUTE ON FUNCTION automation.run_semantic_check(text)       TO service_role;
GRANT EXECUTE ON FUNCTION automation.semantic_scan()                TO service_role;
GRANT EXECUTE ON FUNCTION automation.resolve_healthy_alerts(text[]) TO service_role;
