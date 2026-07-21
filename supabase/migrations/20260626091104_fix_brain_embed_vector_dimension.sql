DROP FUNCTION IF EXISTS public.brain_embed_set_embedding(text, uuid, vector);

CREATE OR REPLACE FUNCTION public.brain_embed_set_embedding(p_table text, p_id uuid, p_embedding vector(1024))
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

REVOKE ALL ON FUNCTION public.brain_embed_set_embedding(text, uuid, vector) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_embed_set_embedding(text, uuid, vector) TO service_role;