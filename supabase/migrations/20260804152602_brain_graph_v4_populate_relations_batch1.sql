-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 04/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- =========================================================
-- Brain Graph V4 — Populate relations batch 1
-- function (public, prokind='f') -> table (public) qua regex parse
-- pg_get_functiondef() body. Xem rationale day du trong hoi thoai 04/08/2026
-- va brain.artifacts key 'brain_graph_v4_populate_relations_v1'.
-- Test truoc trong BEGIN...ROLLBACK: 274 function quet, 93 relation, sample
-- 40 dong khong thay false-positive.
-- =========================================================

DO $$
DECLARE
  v_func RECORD;
  v_table_name TEXT;
  v_func_entity_key TEXT;
  v_table_entity_key TEXT;
  v_relation_id UUID;
  v_matched_count INT := 0;
  v_func_count INT := 0;
BEGIN
  FOR v_func IN
    SELECT p.proname, p.oid, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    v_func_count := v_func_count + 1;
    v_func_entity_key := 'rpc:public.' || v_func.proname;
    PERFORM brain.resolve_entity(v_func_entity_key, v_func.proname);

    FOR v_table_name IN
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
      IF v_func.def ~* ('\m(from|join|into|update|table)\s+(public\.)?"?' || v_table_name || '"?\M') THEN
        v_table_entity_key := 'db_table:public.' || v_table_name;
        PERFORM brain.resolve_entity(v_table_entity_key, v_table_name);

        v_relation_id := brain.add_relation(
          p_subject_canonical_key := v_func_entity_key,
          p_predicate := 'depends_on',
          p_object_canonical_key := v_table_entity_key,
          p_source := 'db_introspection',
          p_review_status := 'suggested',
          p_note := 'Batch populate 04/08/2026 — regex match, chua verify tay',
          p_metadata := jsonb_build_object(
            'detection_method', 'regex_pg_get_functiondef',
            'batch', 'brain_graph_v4_populate_relations_v1'
          )
        );
        v_matched_count := v_matched_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Da quet % function, tao/upsert % relation.', v_func_count, v_matched_count;
END $$;
