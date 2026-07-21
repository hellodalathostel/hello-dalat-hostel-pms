-- Enable RLS on all brain tables that were missing it
ALTER TABLE brain.knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.daily_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.personal_finances ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.financial_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.revenue_manual_log ENABLE ROW LEVEL SECURITY;

-- Revoke any accidental grants to anon/authenticated on these tables
-- (Brain is AI/service-internal only — no client app should touch it directly)
REVOKE ALL ON brain.knowledge FROM anon, authenticated;
REVOKE ALL ON brain.decisions FROM anon, authenticated;
REVOKE ALL ON brain.daily_log FROM anon, authenticated;
REVOKE ALL ON brain.conversations FROM anon, authenticated;
REVOKE ALL ON brain.personal_finances FROM anon, authenticated;
REVOKE ALL ON brain.financial_summary FROM anon, authenticated;
REVOKE ALL ON brain.revenue_manual_log FROM anon, authenticated;
REVOKE ALL ON brain.artifacts FROM anon, authenticated;
REVOKE ALL ON brain.mcp_connections FROM anon, authenticated;
REVOKE ALL ON brain.ai_instructions FROM anon, authenticated;
REVOKE ALL ON brain.ai_skills FROM anon, authenticated;

-- service_role keeps full access (it bypasses RLS by default, but we make it explicit
-- with permissive policies in case RLS enforcement mode ever changes)
CREATE POLICY "service_role_full_access" ON brain.knowledge
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON brain.decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON brain.daily_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON brain.conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON brain.personal_finances
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON brain.financial_summary
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON brain.revenue_manual_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
