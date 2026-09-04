-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 31/07/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- Brain decay & lifecycle v1
-- Idea: agentmemory-style decay (Ebbinghaus) áp lên brain.knowledge/artifacts
-- Không thêm process nào — chỉ SQL thuần, $0.

-- ============ 1. artifacts: usage tracking ============
ALTER TABLE brain.artifacts
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;

-- ============ 2. touch functions ============
-- Gọi sau mỗi lần Claude đọc/dùng record để nuôi decay score.
CREATE OR REPLACE FUNCTION brain.touch_knowledge(p_keys text[])
RETURNS integer
LANGUAGE sql
SET search_path = ''
AS $$
  WITH upd AS (
    UPDATE brain.knowledge
    SET access_count = COALESCE(access_count, 0) + 1,
        last_accessed_at = now()
    WHERE key = ANY(p_keys)
    RETURNING 1
  )
  SELECT count(*)::integer FROM upd;
$$;

CREATE OR REPLACE FUNCTION brain.touch_artifact(p_names text[])
RETURNS integer
LANGUAGE sql
SET search_path = ''
AS $$
  WITH upd AS (
    UPDATE brain.artifacts
    SET use_count = use_count + 1,
        last_used_at = now()
    WHERE name = ANY(p_names)
    RETURNING 1
  )
  SELECT count(*)::integer FROM upd;
$$;

-- ============ 3. knowledge ranked view (decay score) ============
-- score = importance × recency_decay × usage_boost
--  - Evergreen (pricing/rooms/policy/tax/brand): KHÔNG decay theo thời gian —
--    fact đúng cho tới khi valid_to hoặc bị superseded.
--  - Learned (tech/vendor/khác): half-life 90 ngày kể từ lần chạm cuối.
--  - usage_boost: log(1+access_count)/10 — dùng nhiều thì bền hơn.
CREATE OR REPLACE VIEW brain.v_knowledge_ranked
WITH (security_invoker = true) AS
SELECT
  k.id,
  k.category,
  k.key,
  k.value,
  k.confidence,
  k.importance,
  k.access_count,
  k.last_accessed_at,
  k.updated_at,
  k.valid_to,
  (k.category IN ('pricing','rooms','policy','tax','brand')) AS is_evergreen,
  round((
    CASE
      WHEN k.category IN ('pricing','rooms','policy','tax','brand')
        THEN COALESCE(k.importance, 0.5)
      ELSE COALESCE(k.importance, 0.5)
           * exp(
               -ln(2.0)
               * GREATEST(
                   extract(epoch FROM (now() - GREATEST(
                     COALESCE(k.last_accessed_at, k.updated_at, k.created_at),
                     COALESCE(k.updated_at, k.created_at)
                   ))) / 86400.0,
                   0
                 )
               / 90.0
             )
    END
    * (1 + ln(1 + COALESCE(k.access_count, 0)) / 10.0)
  )::numeric, 4) AS decay_score
FROM brain.knowledge k
WHERE k.valid_to IS NULL OR k.valid_to >= CURRENT_DATE;

-- ============ 4. weekly review view (gộp 3 query review cũ + decay) ============
CREATE OR REPLACE VIEW brain.v_review_weekly
WITH (security_invoker = true) AS
-- Knowledge learned đã decay dưới ngưỡng 0.25 → ứng viên archive/supersede
SELECT
  'knowledge'::text AS item_type,
  r.key AS ref,
  left(r.value, 120) AS preview,
  'decay_score ' || r.decay_score || ' < 0.25 — stale, đề xuất set valid_to hoặc update' AS reason,
  GREATEST(COALESCE(r.last_accessed_at, r.updated_at), r.updated_at) AS last_activity
FROM brain.v_knowledge_ranked r
WHERE NOT r.is_evergreen AND r.decay_score < 0.25

UNION ALL
-- Decisions >30 ngày chưa có outcome
SELECT
  'decision', d.topic, left(d.chosen_option, 120),
  'outcome NULL > 30 ngày — cần update kết quả thực tế',
  d.created_at
FROM brain.decisions d
WHERE d.outcome IS NULL AND d.decision_date < CURRENT_DATE - 30

UNION ALL
-- Artifacts active nhưng >60 ngày không dùng và không sửa
SELECT
  'artifact', a.name, left(COALESCE(a.description, ''), 120),
  'active nhưng không dùng > 60 ngày — đề xuất deprecated',
  GREATEST(COALESCE(a.last_used_at, a.updated_at), a.updated_at)
FROM brain.artifacts a
WHERE a.status = 'active'
  AND GREATEST(COALESCE(a.last_used_at, a.updated_at), a.updated_at) < now() - interval '60 days'

ORDER BY item_type, last_activity;