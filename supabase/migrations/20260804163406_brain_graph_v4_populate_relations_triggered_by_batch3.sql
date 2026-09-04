-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 04/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- =========================================================
-- Brain Graph V4 — Populate relations batch 3: triggered_by
-- Nguon: pg_trigger (catalog Postgres chinh thuc, 100% deterministic,
-- KHONG can regex — khac han depends_on/calls). Vi vay duoc phep
-- auto-confirm that qua source='db_introspection' (khong ep p_review_status).
-- Huong quan he: function (subject) triggered_by table (object) —
-- dung dinh nghia da chot "A tu dong chay khi B xay ra".
-- Test truoc BEGIN...ROLLBACK: 23/23 auto-confirmed, khop du lieu da biet.
-- =========================================================

DO $$
DECLARE
  v_trig RECORD;
  v_func_key TEXT;
  v_table_key TEXT;
  v_count INT := 0;
BEGIN
  FOR v_trig IN
    SELECT c.relname AS table_name, p.proname AS function_name,
      t.tgname, 
      (t.tgtype & 66 != 0) AS is_before,
      (t.tgtype & 4 != 0) AS is_insert,
      (t.tgtype & 8 != 0) AS is_delete,
      (t.tgtype & 16 != 0) AS is_update
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  LOOP
    v_func_key := 'rpc:public.' || v_trig.function_name;
    v_table_key := 'db_table:public.' || v_trig.table_name;

    PERFORM brain.resolve_entity(v_func_key, v_trig.function_name);
    PERFORM brain.resolve_entity(v_table_key, v_trig.table_name);

    PERFORM brain.add_relation(
      p_subject_canonical_key := v_func_key,
      p_predicate := 'triggered_by',
      p_object_canonical_key := v_table_key,
      p_source := 'db_introspection',
      p_note := 'Trigger: ' || v_trig.tgname,
      p_metadata := jsonb_build_object(
        'trigger_name', v_trig.tgname,
        'timing', CASE WHEN v_trig.is_before THEN 'BEFORE' ELSE 'AFTER' END,
        'events', array_remove(ARRAY[
          CASE WHEN v_trig.is_insert THEN 'INSERT' END,
          CASE WHEN v_trig.is_update THEN 'UPDATE' END,
          CASE WHEN v_trig.is_delete THEN 'DELETE' END
        ], NULL)
      )
    );
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Da tao/upsert % relation triggered_by.', v_count;
END $$;
