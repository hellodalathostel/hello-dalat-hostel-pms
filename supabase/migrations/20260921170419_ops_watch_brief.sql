-- ops_watch_brief: brief van hanh cho cron / Edge Function. CHI DOC, khong ghi gi.
-- Bo sung cho ops-guardian (automation.guardian_scan), khong thay the.
-- Chi doc automation.automation_runs, guardian_alerts, job_registry va cron.job.
-- ROLLBACK:  DROP FUNCTION automation.ops_watch_brief(timestamptz, interval, boolean);

CREATE OR REPLACE FUNCTION automation.ops_watch_brief(
  p_as_of          timestamptz DEFAULT now(),
  p_window         interval    DEFAULT interval '24 hours',
  p_include_static boolean     DEFAULT false
)
RETURNS TABLE (
  section   text,
  sort_key  integer,
  subject   text,
  detail    text,
  since_ict text,
  source    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
WITH params AS (
  SELECT p_as_of AS p_as_of, p_window AS p_window, p_include_static AS p_include_static
),
win AS (
  SELECT p.p_as_of - p.p_window AS t0, p.p_as_of AS t1, p.p_include_static AS inc_static FROM params p
),
errs AS (
  SELECT r.job_name, r.created_at,
         coalesce(nullif(lower(btrim(regexp_replace(coalesce(r.error_message,''), '^.*:\s*', ''))), ''), 'khong ro') AS cls,
         left(coalesce(r.error_message,''), 80) AS msg
  FROM automation.automation_runs r CROSS JOIN win w
  WHERE r.status <> 'ok' AND r.created_at > w.t0 AND r.created_at <= w.t1
),
clusters AS (
  SELECT cls, count(DISTINCT job_name) AS n_jobs, count(*) AS n_err, min(created_at) AS first_at,
         string_agg(DISTINCT job_name, ', ' ORDER BY job_name) AS jobs
  FROM errs GROUP BY cls HAVING count(DISTINCT job_name) >= 3
),
singles AS (
  SELECT e.job_name, count(*) AS n_err, max(e.created_at) AS last_at,
         (array_agg(e.msg ORDER BY e.created_at DESC))[1] AS last_msg
  FROM errs e WHERE e.cls NOT IN (SELECT cls FROM clusters) GROUP BY e.job_name
),
lastrun AS (
  SELECT r.job_name, max(r.created_at) AS last_at
  FROM automation.automation_runs r CROSS JOIN win w WHERE r.created_at <= w.t1 GROUP BY r.job_name
),
overdue AS (
  SELECT g.job_name, l.last_at
  FROM automation.job_registry g CROSS JOIN win w
  LEFT JOIN lastrun l ON l.job_name = g.job_name
  WHERE g.is_active AND g.heartbeat_enabled
    AND (l.last_at IS NULL OR w.t1 - l.last_at > g.expected_interval + g.grace_period)
    AND NOT EXISTS (
      SELECT 1 FROM automation.guardian_alerts a
      WHERE a.job_name = g.job_name AND a.alerted_at <= w.t1 AND (a.resolved_at IS NULL OR a.resolved_at > w.t1)
    )
),
open_alerts AS (
  SELECT a.job_name, a.alert_type, a.alerted_at
  FROM automation.guardian_alerts a CROSS JOIN win w
  WHERE a.alerted_at <= w.t1 AND (a.resolved_at IS NULL OR a.resolved_at > w.t1)
),
closed_alerts AS (
  SELECT a.job_name, a.alert_type, a.alerted_at, a.resolved_at
  FROM automation.guardian_alerts a CROSS JOIN win w
  WHERE a.resolved_at > w.t0 AND a.resolved_at <= w.t1
),
base AS (
  SELECT r.job_name, percentile_cont(0.5) WITHIN GROUP (ORDER BY r.duration_ms) AS p50
  FROM automation.automation_runs r CROSS JOIN win w
  WHERE r.status = 'ok' AND r.created_at > w.t1 - interval '14 days' AND r.created_at <= w.t0
    AND r.duration_ms IS NOT NULL
  GROUP BY r.job_name HAVING count(*) >= 5
),
slow AS (
  SELECT r.job_name, max(r.duration_ms) AS max_ms, round(b.p50)::int AS p50_ms, max(r.created_at) AS at_
  FROM automation.automation_runs r CROSS JOIN win w JOIN base b ON b.job_name = r.job_name
  WHERE r.created_at > w.t0 AND r.created_at <= w.t1 AND r.duration_ms > greatest(5000, 5 * b.p50)
  GROUP BY r.job_name, b.p50
),
unreg AS (
  SELECT j.jobid, j.jobname, j.schedule
  FROM cron.job j
  WHERE j.active
    AND NOT EXISTS (SELECT 1 FROM automation.job_registry g WHERE g.cron_job_name = j.jobname)
),
orphan AS (
  SELECT g.job_name, g.cron_job_name
  FROM automation.job_registry g
  WHERE g.is_active AND g.cron_job_name IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = g.cron_job_name AND j.active)
),
nov AS (
  SELECT g.job_name, g.severity FROM automation.job_registry g CROSS JOIN win w
  WHERE g.is_active AND g.heartbeat_enabled AND g.semantic_validator IS NULL AND w.inc_static
)
SELECT u.section, u.sort_key, u.subject, u.detail, u.since_ict, u.source FROM (
  SELECT 'nghi_su_co_chung' AS section, 1 AS sort_key, c.jobs AS subject,
         format('%s job cung loi "%s", %s lan', c.n_jobs, c.cls, c.n_err) AS detail,
         to_char(c.first_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS since_ict,
         'automation.automation_runs' AS source
  FROM clusters c
  UNION ALL
  SELECT 'job_chua_giam_sat', 2, u2.jobname,
         'cron job dang chay (' || u2.schedule || ') nhung khong co trong automation.job_registry',
         NULL, 'cron.job + automation.job_registry'
  FROM unreg u2
  UNION ALL
  SELECT 'registry_mo_coi', 2, o.job_name,
         'registry noi active nhung cron job "' || o.cron_job_name || '" khong con hoac da tat',
         NULL, 'automation.job_registry + cron.job'
  FROM orphan o
  UNION ALL
  SELECT 'guardian_khong_thay', 2, od.job_name,
         'qua han theo job_registry, khong co alert mo',
         coalesce(to_char(od.last_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'), 'chua tung chay'),
         'automation.job_registry + automation_runs'
  FROM overdue od
  UNION ALL
  SELECT 'alert_dang_mo', 3, a.job_name, a.alert_type,
         to_char(a.alerted_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
         'automation.guardian_alerts'
  FROM open_alerts a
  UNION ALL
  SELECT 'loi_le', 4, s.job_name, format('%s loi, gan nhat: %s', s.n_err, s.last_msg),
         to_char(s.last_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
         'automation.automation_runs'
  FROM singles s
  UNION ALL
  SELECT 'da_tu_dong', 5, a.job_name,
         a.alert_type || ', mo ' || to_char(a.alerted_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
         to_char(a.resolved_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
         'automation.guardian_alerts'
  FROM closed_alerts a
  UNION ALL
  SELECT 'cham_bat_thuong', 6, s.job_name,
         format('toi da %s ms, trung vi 14 ngay truoc %s ms', s.max_ms, s.p50_ms),
         to_char(s.at_ AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
         'automation.automation_runs'
  FROM slow s
  UNION ALL
  SELECT 'chi_co_heartbeat', 7, n.job_name, 'severity ' || n.severity || ', semantic_validator NULL',
         NULL, 'automation.job_registry'
  FROM nov n
) u
ORDER BY u.sort_key, u.subject
$fn$;

REVOKE ALL ON FUNCTION automation.ops_watch_brief(timestamptz, interval, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION automation.ops_watch_brief(timestamptz, interval, boolean) TO service_role;

COMMENT ON FUNCTION automation.ops_watch_brief(timestamptz, interval, boolean) IS
  'Brief van hanh cron/Edge Function, chi doc. Doc bang skill hello-dalat-ops-watch. Them 2026-09-21.';
