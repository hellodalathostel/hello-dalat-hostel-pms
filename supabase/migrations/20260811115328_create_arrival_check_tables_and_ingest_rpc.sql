-- Migration: create_arrival_check_tables_and_ingest_rpc
-- Ngay: 2026-08-11
-- Da apply qua Supabase MCP apply_migration. File nay de dong bo migration
-- history local theo ky_luat_migration_file_first.

-- Bang log moi lan quet email arrival-check (ke ca 0 issue) -- lich su + debug
CREATE TABLE brain.arrival_check_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_message_id TEXT NOT NULL,
  email_date TIMESTAMPTZ,
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_missing INTEGER NOT NULL DEFAULT 0,
  rows_mismatch INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedupe: khong xu ly lai cung 1 email (cron chay lai do loi mang)
CREATE UNIQUE INDEX idx_arrival_check_log_email_unique ON brain.arrival_check_log(email_message_id);

COMMENT ON TABLE brain.arrival_check_log IS
  'Lich su moi lan booking-arrival-check quet email Booking.com arrival list. 1 row = 1 email da xu ly.';

-- Bang chi tiet tung dong bi flag (missing hoac mismatch)
CREATE TABLE brain.arrival_check_issues (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  log_id BIGINT NOT NULL REFERENCES brain.arrival_check_log(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('missing', 'mismatch')),
  ota_booking_number TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  check_in DATE NOT NULL,
  check_out DATE,
  candidate_booking_id UUID REFERENCES public.bookings(id),
  candidate_ota_booking_number TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_arrival_check_issues_log ON brain.arrival_check_issues(log_id);
CREATE INDEX idx_arrival_check_issues_unresolved ON brain.arrival_check_issues(is_resolved) WHERE is_resolved = false;

COMMENT ON COLUMN brain.arrival_check_issues.issue_type IS
  'missing = ota_booking_number khong ton tai trong bookings nao. mismatch = khong ton tai theo ma, nhung co booking khac cung ngay check_in + ten khach giong -- co the nhap sai ma OTA.';
COMMENT ON COLUMN brain.arrival_check_issues.candidate_booking_id IS
  'Chi co gia tri khi issue_type = mismatch: booking nghi la cung 1 khach nhung ma OTA khac.';

-- RPC ingest tu Edge Function (service_role). brain schema khong expose qua PostgREST.
CREATE OR REPLACE FUNCTION public.ingest_arrival_check(
  p_email_message_id TEXT,
  p_email_date TIMESTAMPTZ,
  p_issues JSONB  -- array of {issue_type, ota_booking_number, guest_name, check_in, check_out, candidate_booking_id, candidate_ota_booking_number}
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'brain', 'public'
AS $$
DECLARE
  v_log_id BIGINT;
  v_issue JSONB;
  v_missing_count INTEGER := 0;
  v_mismatch_count INTEGER := 0;
  v_total INTEGER;
BEGIN
  IF p_issues IS NULL OR jsonb_typeof(p_issues) <> 'array' THEN
    RAISE EXCEPTION 'p_issues phai la jsonb array' USING ERRCODE = 'P0001';
  END IF;

  v_total := jsonb_array_length(p_issues);

  FOR v_issue IN SELECT * FROM jsonb_array_elements(p_issues) LOOP
    IF v_issue->>'issue_type' = 'missing' THEN
      v_missing_count := v_missing_count + 1;
    ELSE
      v_mismatch_count := v_mismatch_count + 1;
    END IF;
  END LOOP;

  INSERT INTO brain.arrival_check_log (email_message_id, email_date, rows_total, rows_missing, rows_mismatch)
  VALUES (p_email_message_id, p_email_date, v_total, v_missing_count, v_mismatch_count)
  ON CONFLICT (email_message_id) DO UPDATE
    SET rows_total = EXCLUDED.rows_total,
        rows_missing = EXCLUDED.rows_missing,
        rows_mismatch = EXCLUDED.rows_mismatch
  RETURNING id INTO v_log_id;

  -- Xoa issues cu cua log nay (truong hop retry/update), roi insert lai
  DELETE FROM brain.arrival_check_issues WHERE log_id = v_log_id;

  FOR v_issue IN SELECT * FROM jsonb_array_elements(p_issues) LOOP
    INSERT INTO brain.arrival_check_issues (
      log_id, issue_type, ota_booking_number, guest_name, check_in, check_out,
      candidate_booking_id, candidate_ota_booking_number
    )
    VALUES (
      v_log_id,
      v_issue->>'issue_type',
      v_issue->>'ota_booking_number',
      v_issue->>'guest_name',
      (v_issue->>'check_in')::DATE,
      NULLIF(v_issue->>'check_out', '')::DATE,
      NULLIF(v_issue->>'candidate_booking_id', '')::UUID,
      v_issue->>'candidate_ota_booking_number'
    );
  END LOOP;

  RETURN JSON_BUILD_OBJECT(
    'log_id', v_log_id,
    'missing_count', v_missing_count,
    'mismatch_count', v_mismatch_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingest_arrival_check(TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_arrival_check(TEXT, TIMESTAMPTZ, JSONB) TO service_role;

-- brain tables: GRANT + RLS bat buoc theo ky luat migration
ALTER TABLE brain.arrival_check_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.arrival_check_issues ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON brain.arrival_check_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON brain.arrival_check_issues TO service_role;
REVOKE ALL ON brain.arrival_check_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON brain.arrival_check_issues FROM PUBLIC, anon, authenticated;

CREATE POLICY "service_role_all" ON brain.arrival_check_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON brain.arrival_check_issues
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Dang ky vao Ops Guardian job_registry -- heartbeat_enabled=false luc dau,
-- bat len sau khi confirm Edge Function da goi report_automation_run() thanh cong.
INSERT INTO automation.job_registry (job_name, description, expected_interval, grace_period, severity, heartbeat_enabled, cron_job_name)
VALUES (
  'booking-arrival-check',
  'Doi chieu email Booking.com "arrival date" hang ngay voi PMS, phat hien booking bi thieu/sai ma OTA',
  '1 day',
  '01:00:00',
  'Cao',
  false,
  'booking-arrival-check-daily'
);
