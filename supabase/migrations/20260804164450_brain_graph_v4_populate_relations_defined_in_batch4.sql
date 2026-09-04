-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 04/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- =========================================================
-- Brain Graph V4 — Populate relations batch 4: defined_in
-- Nguon: supabase_migrations.schema_migrations.statements (SQL text that
-- cua tung migration). Loai TRU migration baseline 20260618000000
-- (backfill_schema_baseline, 39680 ky tu) vi no la snapshot toan schema,
-- khong phai "dinh nghia" that su tung object — giu no se tao hang tram
-- relation sai lech. Dieu kien version > '20260618000000' (strict, khong
-- >=). Vung nay da xac nhan an toan khoi migration drift/pre-baseline
-- squash (xem brain.knowledge quy_trinh_sync_migration_repo_remote,
-- don sach 30/07/2026, moi ban ghi remote deu co file local khop).
-- Scope: CA public VA brain schema (theo yeu cau Hieu 04/08/2026).
-- 1 object co the co NHIEU relation defined_in (vd bi CREATE lai qua
-- backfill migration) — dung ban chat that, khong loai trung.
-- Test truoc BEGIN...ROLLBACK: 112 migration (sau khi loai baseline con
-- 111 duyet), ~159 relation, sample check khong thay false-positive
-- ngoai 1 case card_transactions_raw (dung that, khong phai loi).
-- =========================================================

DO $$
DECLARE
  v_mig RECORD;
  v_match TEXT[];
  v_obj_name TEXT;
  v_mig_key TEXT;
  v_obj_key TEXT;
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

    FOR v_match IN
      SELECT regexp_matches(v_mig.full_sql, 'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*)', 'gi')
    LOOP
      v_obj_name := v_match[1];
      IF v_obj_name NOT LIKE '%.%' THEN v_obj_name := 'public.' || v_obj_name; END IF;
      v_obj_key := 'db_table:' || v_obj_name;
      PERFORM brain.resolve_entity(v_obj_key, v_obj_name);
      PERFORM brain.add_relation(
        v_obj_key, 'defined_in', v_mig_key, 'db_introspection', 'suggested',
        'Batch populate defined_in 04/08/2026 — regex CREATE TABLE',
        jsonb_build_object('detection_method', 'regex_migration_statements', 'batch', 'brain_graph_v4_populate_relations_defined_in_batch4')
      );
      v_count := v_count + 1;
    END LOOP;

    FOR v_match IN
      SELECT regexp_matches(v_mig.full_sql, 'CREATE (?:OR REPLACE )?FUNCTION\s+([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*)', 'gi')
    LOOP
      v_obj_name := v_match[1];
      IF v_obj_name NOT LIKE '%.%' THEN v_obj_name := 'public.' || v_obj_name; END IF;
      v_obj_key := 'rpc:' || v_obj_name;
      PERFORM brain.resolve_entity(v_obj_key, v_obj_name);
      PERFORM brain.add_relation(
        v_obj_key, 'defined_in', v_mig_key, 'db_introspection', 'suggested',
        'Batch populate defined_in 04/08/2026 — regex CREATE FUNCTION',
        jsonb_build_object('detection_method', 'regex_migration_statements', 'batch', 'brain_graph_v4_populate_relations_defined_in_batch4')
      );
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Da quet % migration, tao/upsert % relation defined_in.', v_mig_count, v_count;
END $$;
