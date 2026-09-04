-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 03/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- Cập nhật brain_embed_set_embedding để ghi kèm embedding_model + content_hash mỗi lần set embedding
-- Giữ nguyên chữ ký cũ bằng overload không được (Postgres không cho đổi return type qua CREATE OR REPLACE
-- khi thay đổi tham số theo cách không tương thích) -> dùng DROP rồi CREATE lại với tham số mới có default
-- để không phá lời gọi cũ nào khác nếu có.

DROP FUNCTION IF EXISTS public.brain_embed_set_embedding(text, uuid, vector);

CREATE OR REPLACE FUNCTION public.brain_embed_set_embedding(
  p_table text,
  p_id uuid,
  p_embedding vector,
  p_model text DEFAULT NULL,
  p_content_hash text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'brain', 'public'
AS $function$
BEGIN
  IF p_table = 'knowledge' THEN
    UPDATE brain.knowledge
    SET embedding = p_embedding, embedded_at = now(),
        embedding_model = coalesce(p_model, embedding_model),
        content_hash = coalesce(p_content_hash, content_hash)
    WHERE id = p_id;
  ELSIF p_table = 'decisions' THEN
    UPDATE brain.decisions
    SET embedding = p_embedding, embedded_at = now(),
        embedding_model = coalesce(p_model, embedding_model),
        content_hash = coalesce(p_content_hash, content_hash)
    WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'p_table must be knowledge or decisions';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.brain_embed_set_embedding(text, uuid, vector, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_embed_set_embedding(text, uuid, vector, text, text) TO service_role;

-- brain_embed_get_missing: mở rộng điều kiện WHERE để bắt cả "chưa embed" LẪN "content đổi sau khi embed"
-- (Check A của brain-lint) — so content_hash thay vì chỉ check embedding IS NULL
CREATE OR REPLACE FUNCTION public.brain_embed_get_missing(p_table text, p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, category text, key text, value text, topic text, context text, chosen_option text, rationale text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'brain', 'public'
AS $function$
BEGIN
  IF p_table = 'knowledge' THEN
    RETURN QUERY
      SELECT k.id, k.category, k.key, k.value, NULL::text, NULL::text, NULL::text, NULL::text
      FROM brain.knowledge k
      WHERE k.embedding IS NULL
         OR k.content_hash IS DISTINCT FROM md5(coalesce(k.category,'') || '|' || coalesce(k.key,'') || '|' || coalesce(k.value,''))
      LIMIT p_limit;
  ELSIF p_table = 'decisions' THEN
    RETURN QUERY
      SELECT d.id, NULL::text, NULL::text, NULL::text, d.topic, d.context, d.chosen_option, d.rationale
      FROM brain.decisions d
      WHERE d.embedding IS NULL
         OR d.content_hash IS DISTINCT FROM md5(coalesce(d.topic,'') || '|' || coalesce(d.context,'') || '|' || coalesce(d.chosen_option,'') || '|' || coalesce(d.rationale,''))
      LIMIT p_limit;
  ELSE
    RAISE EXCEPTION 'p_table must be knowledge or decisions';
  END IF;
END;
$function$;