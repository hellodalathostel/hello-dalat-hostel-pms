-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 05/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================

-- Confirm toan bo 47 relation predicate='imports' vua populate (batch5)
-- Dung dung RPC confirm_relation() tung dong, khong UPDATE truc tiep

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM brain.relations WHERE predicate = 'imports' AND review_status = 'suggested'
  LOOP
    PERFORM brain.confirm_relation(r.id);
  END LOOP;
END $$;
