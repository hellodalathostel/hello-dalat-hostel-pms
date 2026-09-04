-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 13/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================

-- Bang log cho tinh nang tu dong dong bo huy booking tu email Booking.com
CREATE TABLE brain.cancellation_sync_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_message_id TEXT NOT NULL,
  ota_booking_number TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('cancelled', 'already_cancelled', 'not_found', 'error')),
  group_id UUID REFERENCES public.groups(id),
  bookings_cancelled_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedupe: 1 email chi xu ly 1 lan (email co the co cung res_id neu Booking.com gui lai)
CREATE UNIQUE INDEX idx_cancellation_sync_log_email_unique ON brain.cancellation_sync_log(email_message_id);
CREATE INDEX idx_cancellation_sync_log_result ON brain.cancellation_sync_log(result);

COMMENT ON TABLE brain.cancellation_sync_log IS
  'Log tu dong dong bo huy booking khi nhan email "Dat phong da huy" tu Booking.com. Moi email = 1 row. result=not_found nghia la res_id trong email khong khop group nao trong PMS (khong phai loi).';

ALTER TABLE brain.cancellation_sync_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON brain.cancellation_sync_log TO service_role;
REVOKE ALL ON brain.cancellation_sync_log FROM PUBLIC, anon, authenticated;
CREATE POLICY "service_role_all" ON brain.cancellation_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
