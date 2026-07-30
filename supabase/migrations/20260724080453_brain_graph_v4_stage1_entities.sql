
-- =========================================================
-- Brain Graph V4 — Giai đoạn 1: entities registry
-- Xem brain.decisions (2026-07-22) cho ly do thiet ke day du
-- =========================================================

-- 1. Bảng entities
CREATE TABLE brain.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'module',
    'db_table',
    'db_view',
    'db_function',
    'rpc',
    'migration',
    'frontend_file',
    'cron_job',
    'edge_function'
  )),
  canonical_key TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE brain.entities IS
  'Brain Graph V4 - Entity registry. Moi thu tham chieu duoc (module, DB object, file, cron, edge function) duoc cap 1 uuid noi bo + canonical_key nguoi-doc-duoc. Thay the polymorphic from_type/from_id.';

COMMENT ON COLUMN brain.entities.canonical_key IS
  'Format bat buoc: {entity_type}:{value}. Vi du: module:checkout_payments_folio, db_function:public.record_payment_txn, migration:20260722_xxx, frontend_file:src/hooks/useUndoEarlyLate.ts, cron_job:task-reminder, edge_function:telegram-webhook. BAT BIEN sau khi tao (patch #15).';

CREATE INDEX idx_entities_entity_type ON brain.entities(entity_type);

-- 2. Trigger: validate prefix khop entity_type + suy entity_type neu thieu (INSERT)
CREATE OR REPLACE FUNCTION brain.validate_entity_canonical_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
BEGIN
  v_prefix := split_part(NEW.canonical_key, ':', 1);

  IF v_prefix = '' OR v_prefix = NEW.canonical_key THEN
    RAISE EXCEPTION 'canonical_key phai theo format {entity_type}:{value}, nhan duoc: %', NEW.canonical_key;
  END IF;

  IF NEW.entity_type IS NULL THEN
    NEW.entity_type := v_prefix;
  END IF;

  IF v_prefix <> NEW.entity_type THEN
    RAISE EXCEPTION 'canonical_key prefix (%) khong khop entity_type (%)', v_prefix, NEW.entity_type;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_entity_canonical_key
  BEFORE INSERT ON brain.entities
  FOR EACH ROW
  EXECUTE FUNCTION brain.validate_entity_canonical_key();

-- 3. Trigger: chan sua canonical_key / entity_type sau khi tao (patch #15 - identity bat bien)
CREATE OR REPLACE FUNCTION brain.prevent_entity_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.canonical_key IS DISTINCT FROM OLD.canonical_key THEN
    RAISE EXCEPTION 'khong duoc doi canonical_key sau khi tao (patch #15 - identity bat bien). id=%, old=%, new=%',
      OLD.id, OLD.canonical_key, NEW.canonical_key;
  END IF;

  IF NEW.entity_type IS DISTINCT FROM OLD.entity_type THEN
    RAISE EXCEPTION 'khong duoc doi entity_type sau khi tao (patch #15 - identity bat bien). id=%, old=%, new=%',
      OLD.id, OLD.entity_type, NEW.entity_type;
  END IF;

  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_entity_identity_change
  BEFORE UPDATE ON brain.entities
  FOR EACH ROW
  EXECUTE FUNCTION brain.prevent_entity_identity_change();

-- 4. RPC resolve_entity — get-or-create idempotent
CREATE OR REPLACE FUNCTION brain.resolve_entity(
  p_canonical_key TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = brain, public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM brain.entities
  WHERE canonical_key = p_canonical_key;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO brain.entities (canonical_key, display_name, description, metadata)
  VALUES (p_canonical_key, p_display_name, p_description, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION brain.resolve_entity IS
  'Get-or-create entity theo canonical_key. Idempotent - goi nhieu lan voi cung key luon tra ve cung id. entity_type tu dong suy tu prefix cua canonical_key qua trigger.';

-- 5. Grant — chi service_role
ALTER TABLE brain.entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON brain.entities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON brain.entities FROM PUBLIC;
REVOKE ALL ON FUNCTION brain.resolve_entity FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brain.resolve_entity TO service_role;
