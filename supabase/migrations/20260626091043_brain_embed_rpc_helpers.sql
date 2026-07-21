-- RPC helpers de brain-embed Edge Function truy cap schema brain
-- (brain khong duoc PostgREST expose, public/graphql_public moi duoc expose)

CREATE OR REPLACE FUNCTION public.brain_embed_get_missing(p_table text, p_limit int DEFAULT 100)
RETURNS TABLE (id uuid, category text, key text, value text, topic text, context text, chosen_option text, rationale text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'brain', 'public'
AS $$
BEGIN
  IF p_table = 'knowledge' THEN
    RETURN QUERY
      SELECT k.id, k.category, k.key, k.value, NULL::text, NULL::text, NULL::text, NULL::text
      FROM brain.knowledge k
      WHERE k.embedding IS NULL
      LIMIT p_limit;
  ELSIF p_table = 'decisions' THEN
    RETURN QUERY
      SELECT d.id, NULL::text, NULL::text, NULL::text, d.topic, d.context, d.chosen_option, d.rationale
      FROM brain.decisions d
      WHERE d.embedding IS NULL
      LIMIT p_limit;
  ELSE
    RAISE EXCEPTION 'p_table must be knowledge or decisions';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.brain_embed_set_embedding(p_table text, p_id uuid, p_embedding vector(1536))
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'brain', 'public'
AS $$
BEGIN
  IF p_table = 'knowledge' THEN
    UPDATE brain.knowledge SET embedding = p_embedding, embedded_at = now() WHERE id = p_id;
  ELSIF p_table = 'decisions' THEN
    UPDATE brain.decisions SET embedding = p_embedding, embedded_at = now() WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'p_table must be knowledge or decisions';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_embed_get_missing(text, int) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.brain_embed_set_embedding(text, uuid, vector) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_embed_get_missing(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.brain_embed_set_embedding(text, uuid, vector) TO service_role;