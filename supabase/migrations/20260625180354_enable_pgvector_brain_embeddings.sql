-- Enable pgvector extension (in extensions schema, not public, per security best practice)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add embedding columns to knowledge and decisions
-- voyage-4-lite produces 1024-dimension vectors
ALTER TABLE brain.knowledge ADD COLUMN IF NOT EXISTS embedding extensions.vector(1024);
ALTER TABLE brain.decisions ADD COLUMN IF NOT EXISTS embedding extensions.vector(1024);

-- Track embedding freshness so we know what still needs (re)embedding
ALTER TABLE brain.knowledge ADD COLUMN IF NOT EXISTS embedded_at timestamptz;
ALTER TABLE brain.decisions ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

-- HNSW index for fast cosine-distance search (good default for <1M rows)
CREATE INDEX IF NOT EXISTS knowledge_embedding_idx ON brain.knowledge
  USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS decisions_embedding_idx ON brain.decisions
  USING hnsw (embedding extensions.vector_cosine_ops);
