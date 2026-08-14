-- =========================================================
-- Brain Graph V4 — Stage 4: graph_snapshots + entity_observations + currency views
-- Xem brain.decisions (2026-07-22, topic "Brain Graph — Currency semantics") cho ly do thiet ke day du.
-- Currency: current = evidence phi-snapshot (persistent, snapshot_id IS NULL)
--   HOAC thuoc snapshot moi nhat applied + is_complete + full cung (repository, scope_id).
-- Effective edge = confirmed + con hieu luc (chua archived) + co current evidence.
-- =========================================================

-- 1. Bang graph_snapshots
CREATE TABLE brain.graph_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id TEXT NOT NULL,
  manifest_hash TEXT NOT NULL UNIQUE,
  repository TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  snapshot_mode TEXT NOT NULL CHECK (snapshot_mode IN ('full', 'delta')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'applied_with_errors', 'failed')),
  is_complete BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE brain.graph_snapshots IS
  'Brain Graph V4 - 1 dong = 1 lan scan/import (thu cong hoac tu dong sau nay) cho 1 (repository, scope_id). manifest_hash chong reuse. is_complete + status=applied + snapshot_mode=full la dieu kien de tro thanh "latest" trong cac view currency.';

COMMENT ON COLUMN brain.graph_snapshots.scope_id IS
  'Phan vung logic trong 1 repository (vi du: pms-frontend, pms-db). Doc lap voi entities.metadata, chi song tren graph_snapshots va ke thua qua entity_observations.';

CREATE INDEX idx_graph_snapshots_repo_scope ON brain.graph_snapshots (repository, scope_id, applied_at DESC);

-- 2. Bang entity_observations
CREATE TABLE brain.entity_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES brain.entities(id) ON DELETE RESTRICT,
  snapshot_id UUID NOT NULL REFERENCES brain.graph_snapshots(id) ON DELETE RESTRICT,
  scope_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_entity_observations_pair UNIQUE (entity_id, scope_id, snapshot_id)
);

COMMENT ON TABLE brain.entity_observations IS
  'Brain Graph V4 - Quan sat ve 1 entity trong 1 scope tai 1 snapshot. Full-replace: ghi observation moi cho (entity_id, scope_id) se xoa sach observation cu cua dung cap do thuoc snapshot khac (khong merge tung key). Dung brain.record_entity_observation() de dam bao dung ngu nghia nay.';

CREATE INDEX idx_entity_observations_entity_scope ON brain.entity_observations (entity_id, scope_id);
CREATE INDEX idx_entity_observations_snapshot ON brain.entity_observations (snapshot_id);

-- 3. relation_evidence.snapshot_id — them FK that (cot da ton tai, dang NULL-able, chua co du lieu)
ALTER TABLE brain.relation_evidence
  ADD CONSTRAINT relation_evidence_snapshot_id_fkey
  FOREIGN KEY (snapshot_id) REFERENCES brain.graph_snapshots(id) ON DELETE RESTRICT;

-- 4. RPC record_entity_observation — full-replace dung ngu nghia, dung cho ghi thu cong/test
CREATE OR REPLACE FUNCTION brain.record_entity_observation(
  p_snapshot_id UUID,
  p_entity_canonical_key TEXT,
  p_scope_id TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = brain, public
AS $$
DECLARE
  v_entity_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM brain.entities WHERE canonical_key = p_entity_canonical_key;
  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity chua resolve: %. Goi brain.resolve_entity() truoc.', p_entity_canonical_key;
  END IF;

  -- Full-replace: xoa sach observation cu cua dung cap (entity_id, scope_id) thuoc snapshot khac
  DELETE FROM brain.entity_observations
  WHERE entity_id = v_entity_id
    AND scope_id = p_scope_id
    AND snapshot_id <> p_snapshot_id;

  INSERT INTO brain.entity_observations (entity_id, snapshot_id, scope_id, metadata)
  VALUES (v_entity_id, p_snapshot_id, p_scope_id, p_metadata)
  ON CONFLICT ON CONSTRAINT uq_entity_observations_pair DO UPDATE
    SET metadata = EXCLUDED.metadata
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION brain.record_entity_observation IS
  'Ghi observation cho 1 (entity, scope_id) trong 1 snapshot, full-replace (xoa ban ghi cua cap do thuoc snapshot khac roi insert lai). Stage 4 chua co scanner tu dong - dung ham nay de ghi thu cong/test.';

-- 5. View current_relation_evidence
CREATE VIEW brain.current_relation_evidence AS
WITH latest_snapshots AS (
  SELECT DISTINCT ON (gs.repository, gs.scope_id) gs.id
  FROM brain.graph_snapshots gs
  WHERE gs.status = 'applied' AND gs.is_complete = true AND gs.snapshot_mode = 'full'
  ORDER BY gs.repository, gs.scope_id, gs.applied_at DESC, gs.id DESC
)
SELECT re.*
FROM brain.relation_evidence re
WHERE re.snapshot_id IS NULL
   OR re.snapshot_id IN (SELECT ls.id FROM latest_snapshots ls);

COMMENT ON VIEW brain.current_relation_evidence IS
  'Evidence "hien hanh": persistent (snapshot_id NULL) hoac thuoc snapshot moi nhat applied+complete+full cung (repository, scope_id). Xem brain.decisions 2026-07-22.';

-- 6. View effective_relations
CREATE VIEW brain.effective_relations AS
SELECT r.*
FROM brain.relations r
WHERE r.review_status = 'confirmed'
  AND r.archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM brain.current_relation_evidence ce WHERE ce.relation_id = r.id
  );

COMMENT ON VIEW brain.effective_relations IS
  'Relation "hieu luc": confirmed + chua archived + co current evidence. Relation bien mat khoi latest complete snapshot se tu roi khoi view nay ma khong mutate row nao.';

-- 7. View current_entity_observations
CREATE VIEW brain.current_entity_observations AS
WITH latest_snapshots AS (
  SELECT DISTINCT ON (gs.repository, gs.scope_id) gs.id
  FROM brain.graph_snapshots gs
  WHERE gs.status = 'applied' AND gs.is_complete = true AND gs.snapshot_mode = 'full'
  ORDER BY gs.repository, gs.scope_id, gs.applied_at DESC, gs.id DESC
)
SELECT eo.*
FROM brain.entity_observations eo
WHERE eo.snapshot_id IN (SELECT ls.id FROM latest_snapshots ls);

COMMENT ON VIEW brain.current_entity_observations IS
  'Observation "hien hanh": thuoc snapshot moi nhat applied+complete+full cung (repository, scope_id). Xem brain.decisions 2026-07-22.';

-- 8. Grant + RLS — chi service_role (dung pattern brain schema hien co, khong mo cho anon/authenticated)
ALTER TABLE brain.graph_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.entity_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON brain.graph_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON brain.entity_observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON brain.graph_snapshots FROM PUBLIC;
REVOKE ALL ON brain.entity_observations FROM PUBLIC;
GRANT ALL ON brain.graph_snapshots TO service_role;
GRANT ALL ON brain.entity_observations TO service_role;

REVOKE ALL ON FUNCTION brain.record_entity_observation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brain.record_entity_observation TO service_role;

REVOKE ALL ON brain.current_relation_evidence FROM PUBLIC;
REVOKE ALL ON brain.effective_relations FROM PUBLIC;
REVOKE ALL ON brain.current_entity_observations FROM PUBLIC;
GRANT SELECT ON brain.current_relation_evidence TO service_role;
GRANT SELECT ON brain.effective_relations TO service_role;
GRANT SELECT ON brain.current_entity_observations TO service_role;
