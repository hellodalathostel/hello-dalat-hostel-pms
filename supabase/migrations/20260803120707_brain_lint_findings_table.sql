-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 03/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- Giai đoạn 2 brain-lint: bảng lưu phát hiện lint qua từng lần chạy
CREATE TABLE IF NOT EXISTS brain.lint_findings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint   text NOT NULL UNIQUE,
  run_id        uuid NOT NULL,
  run_date      date NOT NULL DEFAULT CURRENT_DATE,
  check_code    text NOT NULL CHECK (check_code IN ('A','B','C','D')),
  subcheck      text NOT NULL,
  severity      text NOT NULL CHECK (severity IN ('red','orange','yellow')),
  object_table  text NOT NULL,
  object_id     uuid,
  object_label  text,
  related_id    uuid,
  related_label text,
  detail        text NOT NULL,
  metric        numeric,
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','reopened','accepted','fixed','ignored','auto_resolved')),
  resolution_note text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

COMMENT ON TABLE brain.lint_findings IS
  'Phát hiện của brain-lint (Check A-D). fingerprint ổn định giữa các lần chạy => theo dõi Brain sạch/bẩn dần theo thời gian. Chỉ brain.lint_run() ghi vào đây; không chứa nội dung Brain, chỉ tham chiếu.';

CREATE INDEX IF NOT EXISTS idx_lint_findings_status   ON brain.lint_findings (status, severity);
CREATE INDEX IF NOT EXISTS idx_lint_findings_run      ON brain.lint_findings (run_date DESC);
CREATE INDEX IF NOT EXISTS idx_lint_findings_check    ON brain.lint_findings (check_code, subcheck);

ALTER TABLE brain.lint_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_full_access ON brain.lint_findings;
CREATE POLICY service_role_full_access ON brain.lint_findings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON brain.lint_findings FROM anon, authenticated;
GRANT ALL ON brain.lint_findings TO service_role;

-- View: các mục còn mở, ưu tiên theo mức nghiêm trọng
CREATE OR REPLACE VIEW brain.v_lint_open AS
SELECT severity, check_code, subcheck, object_table, object_label, related_label,
       detail, metric, status,
       first_seen_at::date AS first_seen,
       (CURRENT_DATE - first_seen_at::date) AS ngay_ton_dong,
       fingerprint
FROM brain.lint_findings
WHERE status IN ('open','reopened','accepted')
ORDER BY CASE severity WHEN 'red' THEN 1 WHEN 'orange' THEN 2 ELSE 3 END,
         first_seen_at;

-- View: xu hướng qua từng lần chạy (Brain sạch dần hay bẩn dần)
CREATE OR REPLACE VIEW brain.v_lint_trend AS
SELECT run_date,
       count(*)                                        AS phat_hien,
       count(*) FILTER (WHERE severity = 'red')        AS do,
       count(*) FILTER (WHERE severity = 'orange')     AS cam,
       count(*) FILTER (WHERE severity = 'yellow')     AS vang,
       count(*) FILTER (WHERE status = 'auto_resolved') AS da_tu_het,
       count(*) FILTER (WHERE status IN ('open','reopened')) AS con_mo
FROM brain.lint_findings
GROUP BY run_date
ORDER BY run_date DESC;