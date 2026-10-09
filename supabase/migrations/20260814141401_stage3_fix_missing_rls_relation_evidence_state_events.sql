BEGIN;

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

-- Dry-run check trước khi commit thật
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'brain'
  AND c.relname IN ('relation_evidence','relation_state_events');

ROLLBACK;
