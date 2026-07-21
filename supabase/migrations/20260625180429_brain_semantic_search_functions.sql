-- Semantic search over brain.knowledge using cosine similarity
CREATE OR REPLACE FUNCTION brain.search_knowledge(
  query_embedding extensions.vector(1024),
  match_count int DEFAULT 5,
  min_similarity float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  category text,
  key text,
  value text,
  importance float,
  similarity float
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = brain, extensions, public
AS $$
  SELECT
    k.id,
    k.category,
    k.key,
    k.value,
    k.importance,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM brain.knowledge k
  WHERE k.embedding IS NOT NULL
    AND (k.valid_to IS NULL OR k.valid_to >= CURRENT_DATE)
    AND 1 - (k.embedding <=> query_embedding) >= min_similarity
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Semantic search over brain.decisions
CREATE OR REPLACE FUNCTION brain.search_decisions(
  query_embedding extensions.vector(1024),
  match_count int DEFAULT 5,
  min_similarity float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  topic text,
  context text,
  chosen_option text,
  rationale text,
  decision_date date,
  similarity float
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = brain, extensions, public
AS $$
  SELECT
    d.id,
    d.topic,
    d.context,
    d.chosen_option,
    d.rationale,
    d.decision_date,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM brain.decisions d
  WHERE d.embedding IS NOT NULL
    AND 1 - (d.embedding <=> query_embedding) >= min_similarity
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Lock execution to service_role only (consistent with brain access policy)
REVOKE EXECUTE ON FUNCTION brain.search_knowledge(extensions.vector, int, float) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION brain.search_decisions(extensions.vector, int, float) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brain.search_knowledge(extensions.vector, int, float) TO service_role;
GRANT EXECUTE ON FUNCTION brain.search_decisions(extensions.vector, int, float) TO service_role;
