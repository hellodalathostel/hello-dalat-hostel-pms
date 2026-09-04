-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 04/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- =========================================================
-- Brain Graph V4 — Giai đoạn 2: relations (canonical edges)
-- Xem brain.decisions (2026-07-22 x4, 2026-07-24) cho lý do thiết kế đầy đủ
-- Predicate set chốt tạm 04/08/2026 (trong hội thoại, chưa ghi decision riêng)
-- Test: 8/8 PASS trong BEGIN...ROLLBACK cùng ngày, xem brain.artifacts
-- =========================================================

CREATE TABLE brain.relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  subject_entity_id UUID NOT NULL REFERENCES brain.entities(id) ON DELETE RESTRICT,
  predicate TEXT NOT NULL CHECK (predicate IN (
    'depends_on', 'writes_to', 'reads_from', 'calls',
    'triggered_by', 'defined_in', 'imports', 'supersedes'
  )),
  object_entity_id UUID NOT NULL REFERENCES brain.entities(id) ON DELETE RESTRICT,

  source TEXT NOT NULL CHECK (source IN (
    'db_introspection', 'migration', 'manual', 'claude_suggested'
  )),

  review_status TEXT NOT NULL DEFAULT 'suggested' CHECK (review_status IN (
    'suggested', 'confirmed', 'archived'
  )),

  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,

  CONSTRAINT uq_relations_triple UNIQUE (subject_entity_id, predicate, object_entity_id),
  CONSTRAINT chk_relations_no_self_loop CHECK (subject_entity_id <> object_entity_id)
);

CREATE INDEX idx_relations_subject ON brain.relations(subject_entity_id);
CREATE INDEX idx_relations_object ON brain.relations(object_entity_id);
CREATE INDEX idx_relations_predicate ON brain.relations(predicate);
CREATE INDEX idx_relations_review_status ON brain.relations(review_status);

-- Patch #15 (identity bất biến) áp dụng cho relations
CREATE OR REPLACE FUNCTION brain.prevent_relation_identity_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.subject_entity_id IS DISTINCT FROM OLD.subject_entity_id THEN
    RAISE EXCEPTION 'khong duoc doi subject_entity_id sau khi tao (patch #15). id=%, old=%, new=%', OLD.id, OLD.subject_entity_id, NEW.subject_entity_id;
  END IF;
  IF NEW.object_entity_id IS DISTINCT FROM OLD.object_entity_id THEN
    RAISE EXCEPTION 'khong duoc doi object_entity_id sau khi tao (patch #15). id=%, old=%, new=%', OLD.id, OLD.object_entity_id, NEW.object_entity_id;
  END IF;
  IF NEW.predicate IS DISTINCT FROM OLD.predicate THEN
    RAISE EXCEPTION 'khong duoc doi predicate sau khi tao (patch #15). id=%, old=%, new=%', OLD.id, OLD.predicate, NEW.predicate;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END; $f$;

CREATE TRIGGER trg_prevent_relation_identity_change
  BEFORE UPDATE ON brain.relations
  FOR EACH ROW EXECUTE FUNCTION brain.prevent_relation_identity_change();

-- add_relation(): RPC duy nhất được phép ghi brain.relations
-- Patch #1: cả 2 entity phải đã resolve — KHÔNG tự tạo entity ngầm
-- AI-safety guardrail: source='claude_suggested' luôn ép review_status='suggested'
CREATE OR REPLACE FUNCTION brain.add_relation(
  p_subject_canonical_key TEXT,
  p_predicate TEXT,
  p_object_canonical_key TEXT,
  p_source TEXT,
  p_review_status TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = brain, public AS $f$
DECLARE
  v_subject_id UUID;
  v_object_id UUID;
  v_relation_id UUID;
  v_final_review_status TEXT;
  v_auto_confirm_sources TEXT[] := ARRAY['db_introspection', 'migration'];
BEGIN
  SELECT id INTO v_subject_id FROM brain.entities WHERE canonical_key = p_subject_canonical_key;
  IF v_subject_id IS NULL THEN
    RAISE EXCEPTION 'subject entity chua resolve: %. Goi brain.resolve_entity() truoc.', p_subject_canonical_key;
  END IF;

  SELECT id INTO v_object_id FROM brain.entities WHERE canonical_key = p_object_canonical_key;
  IF v_object_id IS NULL THEN
    RAISE EXCEPTION 'object entity chua resolve: %. Goi brain.resolve_entity() truoc.', p_object_canonical_key;
  END IF;

  IF v_subject_id = v_object_id THEN
    RAISE EXCEPTION 'khong the tao relation tu 1 entity toi chinh no: %', p_subject_canonical_key;
  END IF;

  IF p_source = 'claude_suggested' THEN
    v_final_review_status := 'suggested';
  ELSIF p_review_status IS NOT NULL THEN
    v_final_review_status := p_review_status;
  ELSIF p_source = ANY(v_auto_confirm_sources) THEN
    v_final_review_status := 'confirmed';
  ELSE
    v_final_review_status := 'suggested';
  END IF;

  INSERT INTO brain.relations (
    subject_entity_id, predicate, object_entity_id,
    source, review_status, note, metadata, confirmed_at
  )
  VALUES (
    v_subject_id, p_predicate, v_object_id,
    p_source, v_final_review_status, p_note, p_metadata,
    CASE WHEN v_final_review_status = 'confirmed' THEN now() ELSE NULL END
  )
  ON CONFLICT ON CONSTRAINT uq_relations_triple DO UPDATE
    SET note = COALESCE(EXCLUDED.note, brain.relations.note),
        metadata = brain.relations.metadata || EXCLUDED.metadata,
        updated_at = clock_timestamp()
  RETURNING id INTO v_relation_id;

  RETURN v_relation_id;
END; $f$;

CREATE OR REPLACE FUNCTION brain.confirm_relation(p_relation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = brain, public AS $f$
BEGIN
  UPDATE brain.relations SET review_status = 'confirmed', confirmed_at = now()
  WHERE id = p_relation_id AND review_status <> 'confirmed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relation khong ton tai hoac da confirmed: %', p_relation_id;
  END IF;
END; $f$;

CREATE OR REPLACE FUNCTION brain.archive_relation(p_relation_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = brain, public AS $f$
BEGIN
  UPDATE brain.relations
  SET review_status = 'archived', archived_at = now(),
      note = CASE WHEN p_reason IS NOT NULL THEN COALESCE(note || ' | ', '') || 'archived: ' || p_reason ELSE note END
  WHERE id = p_relation_id AND review_status <> 'archived';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relation khong ton tai hoac da archived: %', p_relation_id;
  END IF;
END; $f$;

ALTER TABLE brain.relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON brain.relations FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON brain.relations FROM PUBLIC;
REVOKE ALL ON FUNCTION brain.add_relation FROM PUBLIC;
REVOKE ALL ON FUNCTION brain.confirm_relation FROM PUBLIC;
REVOKE ALL ON FUNCTION brain.archive_relation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brain.add_relation TO service_role;
GRANT EXECUTE ON FUNCTION brain.confirm_relation TO service_role;
GRANT EXECUTE ON FUNCTION brain.archive_relation TO service_role;
