CREATE TABLE IF NOT EXISTS automation.ops_watch_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acked_at      timestamptz NOT NULL DEFAULT now(),
  as_of         timestamptz NOT NULL UNIQUE,
  window_used   interval    NOT NULL,
  probe_ok      boolean     NOT NULL,
  rows_reported integer     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS automation.ops_watch_reported (
  section           text        NOT NULL,
  subject           text        NOT NULL,
  since_key         text        NOT NULL DEFAULT '',
  first_reported_at timestamptz NOT NULL DEFAULT now(),
  last_reported_at  timestamptz NOT NULL DEFAULT now(),
  times_reported    integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (section, subject, since_key)
);

ALTER TABLE automation.ops_watch_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation.ops_watch_reported ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON automation.ops_watch_runs     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON automation.ops_watch_reported FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION automation.ops_watch_window(p_as_of timestamptz)
RETURNS interval
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT CASE
           WHEN max(r.as_of) IS NULL THEN interval '24 hours'
           ELSE least(
                  greatest(p_as_of - max(r.as_of), interval '0') + interval '10 minutes',
                  interval '7 days')
         END
  FROM automation.ops_watch_runs r
  WHERE r.probe_ok AND r.as_of < p_as_of
$fn$;

CREATE OR REPLACE FUNCTION automation.ops_watch_read(
  p_as_of          timestamptz DEFAULT now(),
  p_include_static boolean     DEFAULT false
)
RETURNS TABLE(
  section text, sort_key integer, subject text, detail text,
  since_ict text, source text, times_reported integer, first_reported_ict text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
WITH ctx AS (
  SELECT p_as_of AS t1, automation.ops_watch_window(p_as_of) AS win
),
probe AS (
  SELECT max(r.created_at) AS last_run,
         count(*) FILTER (WHERE r.created_at > (SELECT c.t1 - c.win FROM ctx c)) AS n_win
  FROM automation.automation_runs r
  WHERE r.created_at <= p_as_of
),
thr AS (
  SELECT coalesce(min(g.expected_interval + g.grace_period), interval '24 hours') AS v
  FROM automation.job_registry g
  WHERE g.is_active AND g.heartbeat_enabled
),
health AS (
  SELECT 'nen_du_lieu'::text AS section, 0 AS sort_key, 'automation_runs'::text AS subject,
         CASE
           WHEN p.last_run IS NULL THEN 'NGUON IM: automation_runs chua co run nao'
           WHEN p_as_of - p.last_run > t.v
             THEN format('NGUON IM: run moi nhat da qua nguong %s', t.v)
           ELSE format('OK: %s run trong cua so', p.n_win)
         END AS detail,
         to_char(p.last_run AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS since_ict,
         'automation.automation_runs + job_registry'::text AS source
  FROM probe p CROSS JOIN thr t
),
brief AS (
  SELECT b.section, b.sort_key, b.subject, b.detail, b.since_ict, b.source
  FROM ctx c
  CROSS JOIN LATERAL automation.ops_watch_brief(c.t1, c.win, p_include_static) b
),
allrows AS (
  SELECT * FROM health
  UNION ALL
  SELECT * FROM brief
)
SELECT x.section, x.sort_key, x.subject, x.detail, x.since_ict, x.source,
       coalesce(l.times_reported, 0),
       to_char(l.first_reported_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI')
FROM allrows x
LEFT JOIN automation.ops_watch_reported l
  ON l.section = x.section
 AND l.subject = x.subject
 AND l.since_key = coalesce(x.since_ict, '')
ORDER BY x.sort_key, x.subject
$fn$;

CREATE OR REPLACE FUNCTION automation.ops_watch_ack(
  p_as_of          timestamptz,
  p_include_static boolean DEFAULT false
)
RETURNS TABLE(o_acked boolean, o_probe_ok boolean, o_rows integer, o_note text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_win interval;
  v_ok  boolean;
  v_n   integer := 0;
BEGIN
  IF p_as_of > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'p_as_of nam trong tuong lai';
  END IF;

  IF EXISTS (SELECT 1 FROM automation.ops_watch_runs r WHERE r.as_of = p_as_of) THEN
    RETURN QUERY SELECT false, true, 0, 'da ack truoc do - khong ghi lai';
    RETURN;
  END IF;

  v_win := automation.ops_watch_window(p_as_of);

  SELECT bool_and(r.detail LIKE 'OK:%') INTO v_ok
  FROM automation.ops_watch_read(p_as_of, p_include_static) r
  WHERE r.section = 'nen_du_lieu';

  IF v_ok IS NOT TRUE THEN
    RETURN QUERY SELECT false, false, 0, 'nguon im hoac khong doc duoc - giu bookmark, khong ghi ledger';
    RETURN;
  END IF;

  WITH snap AS (
    SELECT r.section, r.subject, coalesce(r.since_ict, '') AS since_key
    FROM automation.ops_watch_read(p_as_of, p_include_static) r
    WHERE r.section <> 'nen_du_lieu'
  ),
  up AS (
    INSERT INTO automation.ops_watch_reported AS l (section, subject, since_key)
    SELECT DISTINCT s.section, s.subject, s.since_key FROM snap s
    ON CONFLICT (section, subject, since_key) DO UPDATE
      SET last_reported_at = now(),
          times_reported   = l.times_reported + 1
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_n FROM up;

  DELETE FROM automation.ops_watch_reported d
  WHERE d.last_reported_at < now() - interval '90 days';

  INSERT INTO automation.ops_watch_runs (as_of, window_used, probe_ok, rows_reported)
  VALUES (p_as_of, v_win, true, v_n);

  RETURN QUERY SELECT true, true, v_n, 'ok';
END
$fn$;

REVOKE ALL ON FUNCTION automation.ops_watch_window(timestamptz)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION automation.ops_watch_read(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION automation.ops_watch_ack(timestamptz, boolean)  FROM PUBLIC, anon, authenticated;