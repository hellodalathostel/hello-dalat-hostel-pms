-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 05/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================

-- Mo rong entity_type enum de them 'decision', phuc vu predicate 'supersedes'
-- (quan he giua 2 brain.decisions, khac cac predicate ky thuat khac chi noi code/schema)
-- canonical_key convention rieng cho decision: 'decision:<uuid>' vi brain.decisions
-- khong co unique key dang text nhu brain.knowledge, chi co id bat bien.

ALTER TABLE brain.entities DROP CONSTRAINT entities_entity_type_check;

ALTER TABLE brain.entities ADD CONSTRAINT entities_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'module'::text, 'db_table'::text, 'db_view'::text, 'db_function'::text,
    'rpc'::text, 'migration'::text, 'frontend_file'::text, 'cron_job'::text,
    'edge_function'::text, 'decision'::text
  ]));
