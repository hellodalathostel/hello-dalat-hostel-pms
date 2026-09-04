-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 04/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- =========================================================
-- Brain Graph V4 — Populate relations batch 4 (FIXED): defined_in
-- Ban dau (migration brain_graph_v4_populate_relations_defined_in_batch4)
-- co 2 loi regex: (1) khong loai SQL comment (--...) nen bat nham chu
-- trong comment tieng Viet (vd "Luu y" -> "lu"); (2) "IF NOT EXISTS" viet
-- lien khong \s+ giua tung tu nen optional group fail-open, "IF" dung
-- rieng bi bat nham thanh ten bang. Batch cu (135 relation) da bi
-- archive_relation() toan bo, 3 entity rac (m/lu/IF) da xoa. Them 194
-- entity extension mo coi khac (btree_gist/http/dist helpers) tu batch 1
-- cung duoc don trong phien nay (khong lien quan loi regex nay, phat
-- hien khi audit dong thoi — xem hoi thoai 04/08/2026).
-- Fix: strip comment truoc regex + \s+ giua IF/NOT/EXISTS.
-- Test truoc BEGIN...ROLLBACK sau khi fix: khong con entity ten <=2 ky tu.
-- =========================================================

DO $$
DECLARE
  v_mig RECORD;
  v_match TEXT[];
  v_obj_name TEXT;
  v_mig_key TEXT;
  v_obj_key TEXT;
  v_clean_sql TEXT;
  v_count INT := 0;
  v_mig_count INT := 0;
BEGIN
  FOR v_mig IN
    SELECT version, name, array_to_string(statements, E'\n') AS full_sql
    FROM supabase_migrations.schema_migrations
    WHERE version > '20260618000000'
  LOOP
    v_mig_count := v_mig_count + 1;
    v_mig_key := 'migration:' || v_mig.version || '_' || v_mig.name;
    PERFORM brain.resolve_entity(v_mig_key, v_mig.name);

    v_clean_sql := regexp_replace(v_mig.full_sql, '--[^\n]*', '', 'g');

    FOR v_match IN
      SELECT regexp_matches(v_clean_sql, 'CREATE TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*)', 'gi')
    LOOP
      v_obj_name := v_match[1];
      IF v_obj_name NOT LIKE '%.%' THEN v_obj_name := 'public.' || v_obj_name; END IF;
      v_obj_key := 'db_table:' || v_obj_name;
      PERFORM brain.resolve_entity(v_obj_key, v_obj_name);
      PERFORM brain.add_relation(
        v_obj_key, 'defined_in', v_mig_key, 'db_introspection', 'suggested',
        'Batch populate defined_in 04/08/2026 (fixed) — regex CREATE TABLE, comment-stripped',
        jsonb_build_object('detection_method', 'regex_migration_statements_v2', 'batch', 'brain_graph_v4_populate_relations_defined_in_batch4_fixed')
      );
      v_count := v_count + 1;
    END LOOP;

    FOR v_match IN
      SELECT regexp_matches(v_clean_sql, 'CREATE (?:OR REPLACE )?FUNCTION\s+([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*)', 'gi')
    LOOP
      v_obj_name := v_match[1];
      IF v_obj_name NOT LIKE '%.%' THEN v_obj_name := 'public.' || v_obj_name; END IF;
      v_obj_key := 'rpc:' || v_obj_name;
      PERFORM brain.resolve_entity(v_obj_key, v_obj_name);
      PERFORM brain.add_relation(
        v_obj_key, 'defined_in', v_mig_key, 'db_introspection', 'suggested',
        'Batch populate defined_in 04/08/2026 (fixed) — regex CREATE FUNCTION, comment-stripped',
        jsonb_build_object('detection_method', 'regex_migration_statements_v2', 'batch', 'brain_graph_v4_populate_relations_defined_in_batch4_fixed')
      );
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Da quet % migration, tao/upsert % relation defined_in.', v_mig_count, v_count;
END $$;
