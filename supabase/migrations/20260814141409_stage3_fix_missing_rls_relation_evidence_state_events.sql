-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 14/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
ALTER TABLE brain.relation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.relation_state_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON brain.relation_evidence
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all ON brain.relation_state_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);