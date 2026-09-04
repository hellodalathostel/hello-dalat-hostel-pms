-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 03/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- View giám sát embedding thất bại âm thầm / stale, chạy được bất cứ lúc nào (nền tảng cho brain-lint Check A)
CREATE OR REPLACE VIEW brain.v_embedding_health AS
SELECT 'knowledge' AS table_name, id,
  CASE
    WHEN embedding IS NULL THEN 'chua_tung_embed'
    WHEN content_hash IS DISTINCT FROM md5(coalesce(category,'') || '|' || coalesce(key,'') || '|' || coalesce(value,'')) THEN 'stale_content_da_doi'
    ELSE 'ok'
  END AS trang_thai,
  embedding_model, embedded_at
FROM brain.knowledge
UNION ALL
SELECT 'decisions', id,
  CASE
    WHEN embedding IS NULL THEN 'chua_tung_embed'
    WHEN content_hash IS DISTINCT FROM md5(coalesce(topic,'') || '|' || coalesce(context,'') || '|' || coalesce(chosen_option,'') || '|' || coalesce(rationale,'')) THEN 'stale_content_da_doi'
    ELSE 'ok'
  END,
  embedding_model, embedded_at
FROM brain.decisions;

COMMENT ON VIEW brain.v_embedding_health IS 'Giám sát embedding thất bại âm thầm/stale trên knowledge+decisions. Query: SELECT * FROM brain.v_embedding_health WHERE trang_thai != ''ok'';';