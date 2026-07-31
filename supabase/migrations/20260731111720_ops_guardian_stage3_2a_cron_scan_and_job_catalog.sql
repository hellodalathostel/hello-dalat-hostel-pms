-- =====================================================================
-- Ops Guardian Stage 3.2a — canh tang cron cho toan bo cron job
--
-- Boi canh: 3 cron job (tax-reminder-15/20, dk13-reminder) chet tu 15/07
-- vi JSON header bi escape thua dau backslash. Request khong bao gio cham
-- toi Edge Function => report_automation_run() khong bao gio duoc goi =>
-- heartbeat cua Stage 1/2 khong bat kip (job hang thang thi phai cho hon
-- 1 thang moi keu). Da hotfix command bang cron.alter_job 31/07.
--
-- Stage 3.2a doc thang cron.job_run_details: phu 13/13 job ngay lap tuc,
-- khong phai sua/deploy Edge Function nao.
--
-- Gioi han da biet: net.http_request_queue bi xoa sau khi xu ly va
-- job_run_details.return_message chi ghi "1 row" => KHONG co duong noi
-- mot cron run voi HTTP response cua no. 3.2a chi chung minh cron GOI DUOC
-- function, khong chung minh function LAM DUNG. Do van la viec cua 3.2b.
-- =====================================================================

-- ---------- 1. Mo rong job_registry thanh danh muc day du ----------
-- cron_job_name      : noi registry -> cron.job (NULL = khong canh tang cron)
-- cron_ack_at        : moi lan chay hong TRUOC moc nay coi nhu da xu ly
-- heartbeat_enabled  : tach "co trong danh muc" khoi "da bat heartbeat".
--                      Khong co cot nay thi vua dang ky 11 job la
--                      check_job_health() tra never_run cho ca 11 => bao gia.
ALTER TABLE automation.job_registry
  ADD COLUMN IF NOT EXISTS cron_job_name text,
  ADD COLUMN IF NOT EXISTS cron_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN automation.job_registry.cron_job_name IS
  'Ten job trong cron.job. NULL = khong canh o tang cron.';
COMMENT ON COLUMN automation.job_registry.cron_ack_at IS
  'Moi lan chay hong co start_time <= moc nay duoc coi la da xu ly, khong alert nua.';
COMMENT ON COLUMN automation.job_registry.heartbeat_enabled IS
  'true = Edge Function da goi report_automation_run(). Bat SAU khi deploy, khong bat truoc.';

-- ---------- 2. Them alert_type cron_fail ----------
ALTER TABLE automation.guardian_alerts DROP CONSTRAINT guardian_alerts_alert_type_check;
ALTER TABLE automation.guardian_alerts ADD CONSTRAINT guardian_alerts_alert_type_check
  CHECK (alert_type = ANY (ARRAY['silent','error','never_run','semantic_fail','cron_fail']));

-- ---------- 3. Noi 2 job cu vao cron, seed 11 job con lai ----------
UPDATE automation.job_registry SET cron_job_name = 'task-reminder' WHERE job_name = 'task-reminder';
UPDATE automation.job_registry SET cron_job_name = 'ops-guardian'  WHERE job_name = 'ops-guardian';

-- heartbeat_enabled = false: chi vao danh muc de canh tang cron + de FK
-- cua guardian_alerts hop le. Bat len sau khi Edge Function tuong ung
-- da goi report_automation_run() VA da co row that trong automation_runs.
INSERT INTO automation.job_registry
  (job_name, description, expected_interval, grace_period, severity, cron_job_name, heartbeat_enabled)
VALUES
  ('checkin-reminder','Nhac check-in 07:00 ICT','1 day','2 hours','Cao','checkin-reminder',false),
  ('daily-revenue','Ghi doanh thu theo check-in 23:00 ICT','1 day','2 hours','Cao','daily-revenue',false),
  ('daily-revenue-summary','Tong ket doanh thu 01:00 ICT','1 day','2 hours','Binh Thuong','daily-revenue-summary',false),
  ('room-report-bot','Bao cao phong 08:00 ICT','1 day','2 hours','Binh Thuong','daily-room-report',false),
  ('notion-daily-log','Daily log Notion 06:30 ICT','1 day','2 hours','Binh Thuong','notion-daily-log',false),
  ('email-transaction-sync','Sync giao dich email moi gio','1 hour','30 minutes','Cao','email-transaction-sync',false),
  ('price-alert-bot','Canh bao gia thu 2 hang tuan','7 days','1 day','Binh Thuong','price-alert-weekly',false),
  ('weekly-review-reminder','Nhac review tuan thu 2','7 days','1 day','Binh Thuong','weekly-review-reminder',false),
  ('tax-reminder-15','Nhac thue ngay 15 hang thang','1 mon','1 day','Khan','tax-reminder-15',false),
  ('tax-reminder-20','Nhac thue ngay 20 hang thang','1 mon','1 day','Khan','tax-reminder-20',false),
  ('dk13-reminder','Nhac DK13 quy 25/1,4,7,10','3 mons','1 day','Khan','dk13-reminder',false)
ON CONFLICT (job_name) DO NOTHING;

-- ---------- 4. check_job_health: chi soi job da bat heartbeat ----------
CREATE OR REPLACE FUNCTION automation.check_job_health()
RETURNS TABLE(out_job_name text, out_severity text, out_issue text,
              out_last_run_at timestamptz, out_silent_for interval, out_last_error text)
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $f$
  WITH last_run AS (
    SELECT DISTINCT ON (r.job_name) r.job_name, r.created_at, r.status, r.error_message
    FROM automation.automation_runs r ORDER BY r.job_name, r.created_at DESC)
  SELECT j.job_name, j.severity,
         CASE WHEN lr.job_name IS NULL THEN 'never_run'
              WHEN lr.status = 'error'  THEN 'error'
              ELSE 'silent' END,
         lr.created_at, now() - lr.created_at, lr.error_message
  FROM automation.job_registry j
  LEFT JOIN last_run lr ON lr.job_name = j.job_name
  WHERE j.is_active AND j.heartbeat_enabled
    AND (lr.job_name IS NULL OR lr.status = 'error'
         OR now() - lr.created_at > j.expected_interval + j.grace_period);
$f$;

-- ---------- 5. cron_scan ----------
CREATE OR REPLACE FUNCTION automation.cron_scan()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_results jsonb;
BEGIN
  WITH last_run AS (
    SELECT DISTINCT ON (d.jobid) d.jobid, d.status, d.start_time, d.return_message
    FROM cron.job_run_details d ORDER BY d.jobid, d.start_time DESC
  ), scan AS (
    SELECT j.job_name, j.severity, j.cron_job_name, c.active AS cron_active,
           lr.status AS last_status, lr.start_time AS last_run_at,
           -- Chi FAIL o bang chung khong the choi cai: co lich su chay, lan gan
           -- nhat that bai, va that bai do xay ra SAU moc ack.
           CASE
             WHEN c.jobid IS NULL           THEN 'unknown'
             WHEN NOT c.active              THEN 'unknown'
             WHEN lr.jobid IS NULL          THEN 'unknown'
             WHEN lr.status = 'succeeded'   THEN 'ok'
             WHEN j.cron_ack_at IS NOT NULL
                  AND lr.start_time <= j.cron_ack_at THEN 'unknown'
             ELSE 'fail' END AS verdict,
           CASE
             WHEN c.jobid IS NULL           THEN 'cron_job_missing'
             WHEN NOT c.active              THEN 'cron_disabled'
             -- Job moi tao chua toi lich chay lan nao: cron khong luu thoi diem
             -- tao job nen KHONG chung minh duoc no le ra phai chay roi => unknown.
             WHEN lr.jobid IS NULL          THEN 'no_run_history'
             WHEN lr.status = 'succeeded'   THEN NULL
             WHEN j.cron_ack_at IS NOT NULL
                  AND lr.start_time <= j.cron_ack_at THEN 'acked_stale_failure'
             ELSE 'cron_command_error' END AS reason,
           left(regexp_replace(COALESCE(lr.return_message,''), E'[\n\r]+', ' ', 'g'), 300) AS last_message
    FROM automation.job_registry j
    LEFT JOIN cron.job c ON c.jobname = j.cron_job_name
    LEFT JOIN last_run lr ON lr.jobid = c.jobid
    WHERE j.is_active AND j.cron_job_name IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.job_name), '[]'::jsonb) INTO v_results FROM scan s;

  INSERT INTO automation.guardian_alerts (job_name, alert_type)
  SELECT e->>'job_name', 'cron_fail' FROM jsonb_array_elements(v_results) e
  WHERE e->>'verdict' = 'fail'
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'checked', jsonb_array_length(v_results),
    'failed',  (SELECT count(*) FROM jsonb_array_elements(v_results) e WHERE e->>'verdict'='fail'),
    'unknown', (SELECT count(*) FROM jsonb_array_elements(v_results) e WHERE e->>'verdict'='unknown'),
    'results', v_results, 'scanned_at', now());
END; $f$;

-- ---------- 6. guardian_scan: them B0, gom cron_fail vao unhealthy ----------
CREATE OR REPLACE FUNCTION automation.guardian_scan()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
  v_cron jsonb; v_all_issues jsonb; v_new_alert_jobs jsonb; v_new_alerts jsonb;
  v_semantic jsonb; v_resolved jsonb; v_unhealthy text[]; v_ok_count integer;
BEGIN
  -- B0: tang cron chay TRUOC heartbeat. idx_guardian_alerts_one_open unique
  -- theo job_name => moi job chi giu 1 alert mo, ai chen truoc thi thang.
  -- Cron chet la NGUYEN NHAN GOC, heartbeat im la TRIEU CHUNG.
  v_cron := automation.cron_scan();

  -- B1: snapshot heartbeat (goi check_job_health MOT lan duy nhat)
  SELECT COALESCE(jsonb_agg(to_jsonb(y)),'[]'::jsonb) INTO v_all_issues FROM (
    SELECT h.out_job_name AS job_name, h.out_severity AS severity, h.out_issue AS issue,
           h.out_last_run_at AS last_run_at, h.out_silent_for::text AS silent_for,
           h.out_last_error AS last_error
    FROM automation.check_job_health() h) y;

  -- B2: alert heartbeat
  WITH ins AS (
    INSERT INTO automation.guardian_alerts (job_name, alert_type)
    SELECT e->>'job_name', e->>'issue' FROM jsonb_array_elements(v_all_issues) e
    ON CONFLICT DO NOTHING RETURNING job_name)
  SELECT COALESCE(jsonb_agg(i.job_name),'[]'::jsonb) INTO v_new_alert_jobs FROM ins i;

  SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) INTO v_new_alerts
  FROM jsonb_array_elements(v_all_issues) e
  WHERE e->>'job_name' IN (SELECT jsonb_array_elements_text(v_new_alert_jobs));

  -- B3+B4: semantic
  v_semantic := automation.semantic_scan();

  -- B5: resolve tren dung snapshot luot nay. THIEU nhanh cron o day thi
  -- alert cron_fail vua tao se bi dong ngay trong cung mot luot quet.
  SELECT COALESCE(array_agg(DISTINCT s.job_name), ARRAY[]::text[]) INTO v_unhealthy FROM (
    SELECT e->>'job_name' AS job_name FROM jsonb_array_elements(v_all_issues) e
    UNION
    SELECT r->>'job_name' FROM jsonb_array_elements(v_semantic->'results') r WHERE r->>'verdict'='fail'
    UNION
    SELECT c->>'job_name' FROM jsonb_array_elements(v_cron->'results') c WHERE c->>'verdict'='fail') s;

  v_resolved := automation.resolve_healthy_alerts(v_unhealthy);

  SELECT count(*)::integer INTO v_ok_count FROM automation.job_registry j
  WHERE j.is_active AND NOT (j.job_name = ANY (v_unhealthy));

  RETURN jsonb_build_object('new_alerts',v_new_alerts,'all_issues',v_all_issues,
    'cron',v_cron,'semantic',v_semantic,'resolved',v_resolved,
    'ok_count',v_ok_count,'scanned_at',now());
END; $f$;

-- ---------- 7. Ack 3 job da hotfix bang cron.alter_job ngay 31/07 ----------
-- Lan chay hong cuoi cua chung la 15/07, 20/07, 25/07 - deu truoc hotfix.
-- Khong ack thi guardian keu ve loi da sua suot toi 25/10 (dk13 chay 3 thang/lan).
UPDATE automation.job_registry SET cron_ack_at = now()
WHERE job_name IN ('tax-reminder-15','tax-reminder-20','dk13-reminder');

-- ---------- 8. Grants ----------
REVOKE EXECUTE ON FUNCTION automation.cron_scan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION automation.cron_scan() TO service_role;
