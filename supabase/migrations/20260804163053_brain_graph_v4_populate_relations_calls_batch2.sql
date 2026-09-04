-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 04/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- =========================================================
-- Brain Graph V4 — Populate relations batch 2: calls (RPC gọi RPC)
-- Regex tìm "callee_name(" trong body caller (đã bỏ dòng signature đầu
-- để tránh tự match chính mình). Loại self-reference (recursive).
-- Xem rationale đầy đủ trong hội thoại 04/08/2026.
-- Test trước trong BEGIN...ROLLBACK: 274 function quét, 27 relation (20
-- nghiệp vụ PMS thật, 5 thuộc extension http — giữ lại theo yêu cầu Hiếu,
-- đánh dấu metadata.is_extension_function=true để lọc riêng sau này).
-- =========================================================

DO $$
DECLARE
  v_caller RECORD;
  v_callee_name TEXT;
  v_caller_key TEXT;
  v_callee_key TEXT;
  v_body TEXT;
  v_is_ext BOOLEAN;
  v_matched_count INT := 0;
  v_func_count INT := 0;
BEGIN
  FOR v_caller IN
    SELECT p.proname, p.oid, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    v_func_count := v_func_count + 1;
    v_caller_key := 'rpc:public.' || v_caller.proname;
    v_body := regexp_replace(v_caller.def, '^CREATE OR REPLACE FUNCTION[^\n]*\n', '');
    PERFORM brain.resolve_entity(v_caller_key, v_caller.proname);

    FOR v_callee_name IN
      SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.prokind = 'f'
    LOOP
      IF v_callee_name = v_caller.proname THEN
        CONTINUE; -- loại self-reference (recursive calls không xử lý ở batch này)
      END IF;

      IF v_body ~* ('\m' || v_callee_name || '\s*\(') THEN
        v_callee_key := 'rpc:public.' || v_callee_name;
        PERFORM brain.resolve_entity(v_callee_key, v_callee_name);

        -- Kiểm tra callee có thuộc extension không (đánh dấu, không loại)
        SELECT EXISTS (
          SELECT 1 FROM pg_proc p2
          JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
          JOIN pg_depend d ON d.objid = p2.oid AND d.deptype = 'e'
          WHERE n2.nspname = 'public' AND p2.proname = v_callee_name
        ) INTO v_is_ext;

        PERFORM brain.add_relation(
          p_subject_canonical_key := v_caller_key,
          p_predicate := 'calls',
          p_object_canonical_key := v_callee_key,
          p_source := 'db_introspection',
          p_review_status := 'suggested',
          p_note := 'Batch populate calls 04/08/2026 — regex match, chua verify tay',
          p_metadata := jsonb_build_object(
            'detection_method', 'regex_function_call',
            'batch', 'brain_graph_v4_populate_relations_calls_batch2',
            'is_extension_function', v_is_ext
          )
        );
        v_matched_count := v_matched_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Da quet % function, tao/upsert % relation calls.', v_func_count, v_matched_count;
END $$;
