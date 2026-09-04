-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 03/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
DROP FUNCTION IF EXISTS brain.lint_run(boolean, text);

CREATE FUNCTION brain.lint_run(
  p_persist boolean DEFAULT true,
  p_model   text    DEFAULT 'voyage-4-lite'
)
RETURNS TABLE (
  severity      text,
  check_code    text,
  subcheck      text,
  object_table  text,
  object_label  text,
  related_label text,
  detail        text,
  metric        numeric,
  status        text,
  first_seen    date
)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_run_id uuid := gen_random_uuid();
  -- L6 cũ: cơ chế touch chỉ tồn tại từ 31/07/2026 => access_count=0 vô nghĩa
  -- cho tới khi tích lũy đủ ~3 tháng dữ liệu.
  v_orphan_on boolean := CURRENT_DATE >= DATE '2026-11-01';
BEGIN
  DROP TABLE IF EXISTS _lint_f;
  CREATE TEMP TABLE _lint_f (
    check_code text, subcheck text, severity text,
    object_table text, object_id uuid, object_label text,
    related_id uuid, related_label text,
    detail text, metric numeric, fingerprint text
  ) ON COMMIT DROP;

  --------------------------------------------------------------------
  -- CHECK A — Embedding thiếu / stale / lệch model
  --------------------------------------------------------------------
  -- A1: chưa embed quá 24h (đã lỡ ≥4 lô ops-guardian) => pipeline hỏng thật
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, detail, metric)
  SELECT 'A', 'chua_embed_qua_han', 'red', z.tbl, z.id, z.label,
         format('Chưa embed sau %s giờ — đã lỡ ≥4 lô, pipeline hỏng thật (không phải hàng đợi)',
                round((extract(epoch FROM (now() - z.created_at)) / 3600)::numeric)),
         round((extract(epoch FROM (now() - z.created_at)) / 3600)::numeric)
  FROM (
    SELECT 'knowledge'::text AS tbl, id, key AS label, created_at
    FROM brain.knowledge WHERE embedding IS NULL
    UNION ALL
    SELECT 'decisions', id, topic, created_at
    FROM brain.decisions WHERE embedding IS NULL
  ) z
  WHERE z.created_at < now() - interval '24 hours';

  -- A2: content đã sửa nhưng chưa re-embed (content_hash lệch) quá 24h
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, detail, metric)
  SELECT 'A', 'stale_chua_reembed', 'orange', 'knowledge', k.id, k.key,
         format('Nội dung đã sửa %s ngày trước nhưng embedding vẫn của bản cũ (content_hash lệch)',
                (CURRENT_DATE - k.updated_at::date)),
         (CURRENT_DATE - k.updated_at::date)::numeric
  FROM brain.knowledge k
  WHERE k.embedding IS NOT NULL
    AND k.content_hash IS DISTINCT FROM
        md5(COALESCE(k.category,'') || '|' || COALESCE(k.key,'') || '|' || COALESCE(k.value,''))
    AND k.updated_at < now() - interval '24 hours';

  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, detail, metric)
  SELECT 'A', 'stale_chua_reembed', 'orange', 'decisions', d.id, d.topic,
         format('Nội dung đã sửa %s ngày trước nhưng embedding vẫn của bản cũ (content_hash lệch)',
                (CURRENT_DATE - COALESCE(d.updated_at, d.created_at)::date)),
         (CURRENT_DATE - COALESCE(d.updated_at, d.created_at)::date)::numeric
  FROM brain.decisions d
  WHERE d.embedding IS NOT NULL
    AND d.content_hash IS DISTINCT FROM
        md5(COALESCE(d.topic,'') || '|' || COALESCE(d.context,'') || '|' ||
            COALESCE(d.chosen_option,'') || '|' || COALESCE(d.rationale,''))
    AND COALESCE(d.updated_at, d.created_at) < now() - interval '24 hours';

  -- A3: lệch model — gom theo model, 1 dòng/model (không làm ngập báo cáo)
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_label, detail, metric)
  SELECT 'A', 'lech_model', 'yellow', z.tbl, COALESCE(z.m, '(NULL)'),
         format('%s dòng %s embed bằng model "%s", khác model hiện tại "%s" — vector không so sánh được với phần còn lại',
                z.n, z.tbl, COALESCE(z.m,'NULL'), p_model),
         z.n
  FROM (
    SELECT 'knowledge'::text AS tbl, embedding_model AS m, count(*) AS n
    FROM brain.knowledge WHERE embedding IS NOT NULL GROUP BY 1, 2
    UNION ALL
    SELECT 'decisions', embedding_model, count(*)
    FROM brain.decisions WHERE embedding IS NOT NULL GROUP BY 1, 2
  ) z
  WHERE z.m IS DISTINCT FROM p_model;

  --------------------------------------------------------------------
  -- CHECK B — Orphan & tham chiếu gãy
  --------------------------------------------------------------------
  -- B1: artifacts.depends_on (text[] theo name)
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, related_label, detail)
  SELECT 'B', 'ref_gay_depends_on', 'orange', 'artifacts', a.id, a.name, d,
         format('depends_on trỏ tới artifact không tồn tại: "%s"', d)
  FROM brain.artifacts a, unnest(a.depends_on) AS d
  WHERE a.depends_on IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM brain.artifacts x WHERE x.name = d);

  -- B2: decisions.related_artifacts (uuid[] theo id — KHÔNG phải name)
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, related_id, related_label, detail)
  SELECT 'B', 'ref_gay_related_artifacts', 'orange', 'decisions', dc.id, dc.topic, r, r::text,
         format('related_artifacts trỏ tới artifact id không tồn tại: %s', r)
  FROM brain.decisions dc, unnest(dc.related_artifacts) AS r
  WHERE dc.related_artifacts IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM brain.artifacts x WHERE x.id = r);

  -- B3: artifacts.decision_id trỏ tới decision đã biến mất
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, related_id, related_label, detail)
  SELECT 'B', 'ref_gay_decision_id', 'orange', 'artifacts', a.id, a.name, a.decision_id, a.decision_id::text,
         format('decision_id trỏ tới decision không tồn tại: %s', a.decision_id)
  FROM brain.artifacts a
  WHERE a.decision_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM brain.decisions d WHERE d.id = a.decision_id);

  -- B4/B5: orphan thật sự — chỉ bật từ 11/2026 khi access_count đủ ý nghĩa
  IF v_orphan_on THEN
    INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, detail, metric)
    SELECT 'B', 'orphan_knowledge', 'yellow', 'knowledge', k.id, k.key,
           format('Chưa từng được đọc kể từ khi tạo (%s ngày)', (CURRENT_DATE - k.created_at::date)),
           (CURRENT_DATE - k.created_at::date)::numeric
    FROM brain.knowledge k
    WHERE COALESCE(k.access_count, 0) = 0
      AND k.created_at < now() - interval '60 days'
      AND (k.valid_to IS NULL OR k.valid_to >= CURRENT_DATE);

    INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, detail, metric)
    SELECT 'B', 'orphan_artifact', 'yellow', 'artifacts', a.id, a.name,
           format('Artifact active nhưng chưa từng dùng (%s ngày)', (CURRENT_DATE - a.created_at::date)),
           (CURRENT_DATE - a.created_at::date)::numeric
    FROM brain.artifacts a
    WHERE COALESCE(a.use_count, 0) = 0
      AND a.status = 'active'
      AND a.created_at < now() - interval '60 days';
  END IF;

  --------------------------------------------------------------------
  -- CHECK C — Hết hạn / stale (THỜI GIAN, không bao giờ similarity)
  --------------------------------------------------------------------
  -- C1: hết hạn nhưng vẫn đang được đọc => nguy hiểm nhất
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, detail, metric)
  SELECT 'C', 'het_han_van_doc', 'red', 'knowledge', k.id, k.key,
         format('valid_to %s đã qua nhưng còn được đọc %s lần, lần cuối %s',
                k.valid_to, COALESCE(k.access_count,0), k.last_accessed_at::date),
         COALESCE(k.access_count, 0)::numeric
  FROM brain.knowledge k
  WHERE k.valid_to IS NOT NULL
    AND k.valid_to < CURRENT_DATE
    AND k.last_accessed_at IS NOT NULL
    AND k.last_accessed_at::date > k.valid_to;

  -- C2: decision quá review_date mà chưa có outcome
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, detail, metric)
  SELECT 'C', 'qua_review_date', 'orange', 'decisions', d.id, d.topic,
         format('review_date %s đã qua %s ngày, outcome vẫn trống',
                d.review_date, (CURRENT_DATE - d.review_date)),
         (CURRENT_DATE - d.review_date)::numeric
  FROM brain.decisions d
  WHERE d.review_date IS NOT NULL
    AND d.review_date < CURRENT_DATE
    AND d.outcome IS NULL
    AND (d.valid_to IS NULL OR d.valid_to >= CURRENT_DATE);

  -- C3: fact quan trọng + đọc nhiều + lâu không cập nhật
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, detail, metric)
  SELECT 'C', 'quan_trong_stale', 'orange', 'knowledge', k.id, k.key,
         format('importance %s, đọc %s lần, %s ngày không cập nhật — còn đúng không?',
                k.importance, k.access_count, (CURRENT_DATE - k.updated_at::date)),
         (CURRENT_DATE - k.updated_at::date)::numeric
  FROM brain.knowledge k
  WHERE k.importance >= 0.6
    AND COALESCE(k.access_count, 0) >= 3
    AND k.updated_at < now() - interval '90 days'
    AND (k.valid_to IS NULL OR k.valid_to >= CURRENT_DATE);

  -- C4: nhóm thay đổi ngoài tầm kiểm soát (pricing/policy/tax/vendor) quá 180 ngày
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, detail, metric)
  SELECT 'C', 'nhom_ngoai_tam_kiem_soat', 'orange', 'knowledge', k.id, k.key,
         format('category %s, %s ngày không cập nhật — nhóm này đổi theo bên ngoài, dễ lệch thực tế',
                k.category, (CURRENT_DATE - k.updated_at::date)),
         (CURRENT_DATE - k.updated_at::date)::numeric
  FROM brain.knowledge k
  WHERE k.category IN ('pricing','policy','tax','vendor')
    AND k.updated_at < now() - interval '180 days'
    AND (k.valid_to IS NULL OR k.valid_to >= CURRENT_DATE)
    AND NOT (k.importance >= 0.6 AND COALESCE(k.access_count,0) >= 3
             AND k.updated_at < now() - interval '90 days');

  --------------------------------------------------------------------
  -- CHECK D — Gần trùng / mâu thuẫn (chỉ nêu ứng viên, KHÔNG tự gộp)
  --------------------------------------------------------------------
  -- D1: MÂU THUẪN CẤU TRÚC — cùng key, khác category, khác value.
  -- Không phụ thuộc cosine (MemStrata: similarity không phân biệt được mâu thuẫn với trùng lặp).
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, related_id, related_label, detail)
  SELECT 'D', 'mau_thuan_cung_key', 'red', 'knowledge', a.id, a.category || '/' || a.key,
         b.id, b.category || '/' || b.key,
         format('Cùng key "%s" tồn tại ở 2 category, giá trị khác nhau — một trong hai đã lỗi thời', a.key)
  FROM brain.knowledge a
  JOIN brain.knowledge b ON a.key = b.key AND a.id < b.id AND a.category <> b.category
  WHERE a.value IS DISTINCT FROM b.value
    AND a.value NOT LIKE '%[ĐÃ ĐÓNG%' AND b.value NOT LIKE '%[ĐÃ ĐÓNG%'
    AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
    AND (b.valid_to IS NULL OR b.valid_to >= CURRENT_DATE);

  -- D2: gần chắc trùng lặp (cos_dist < 0.05) cùng category
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, related_id, related_label, detail, metric)
  SELECT 'D', 'gan_chac_trung_lap', 'orange', 'knowledge', a.id, a.key, b.id, b.key,
         format('cos_dist %s (<0.05) cùng category %s — gần chắc là một fact ghi hai lần',
                round((a.embedding <=> b.embedding)::numeric, 4), a.category),
         round((a.embedding <=> b.embedding)::numeric, 4)
  FROM brain.knowledge a
  JOIN brain.knowledge b
    ON a.category = b.category AND a.id < b.id
   AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
  WHERE (a.embedding <=> b.embedding) < 0.05
    AND a.value NOT LIKE '%[ĐÃ ĐÓNG%' AND b.value NOT LIKE '%[ĐÃ ĐÓNG%'
    AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
    AND (b.valid_to IS NULL OR b.valid_to >= CURRENT_DATE);

  -- D3: vùng cần review (0.05 - 0.12) — chỉ ghi nhận
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, related_id, related_label, detail, metric)
  SELECT 'D', 'vung_review', 'yellow', 'knowledge', z.id_a, z.key_a, z.id_b, z.key_b,
         format('cos_dist %s (vùng 0.05-0.12) — có thể bổ sung nhau, không nhất thiết là lỗi', z.dist),
         z.dist
  FROM (
    SELECT a.id AS id_a, a.key AS key_a, b.id AS id_b, b.key AS key_b,
           round((a.embedding <=> b.embedding)::numeric, 4) AS dist
    FROM brain.knowledge a
    JOIN brain.knowledge b
      ON a.category = b.category AND a.id < b.id
     AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
    WHERE (a.embedding <=> b.embedding) >= 0.05
      AND (a.embedding <=> b.embedding) < 0.12
      AND a.value NOT LIKE '%[ĐÃ ĐÓNG%' AND b.value NOT LIKE '%[ĐÃ ĐÓNG%'
      AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
      AND (b.valid_to IS NULL OR b.valid_to >= CURRENT_DATE)
    ORDER BY 5 ASC
    LIMIT 20
  ) z;

  -- D4: decisions trùng — chỉ khi CẢ HAI còn outcome trống
  -- (outcome NOT NULL = cặp đã được xử lý ở lint trước, đừng hỏi lại)
  INSERT INTO _lint_f (check_code, subcheck, severity, object_table, object_id, object_label, related_id, related_label, detail, metric)
  SELECT 'D', 'decisions_trung', 'orange', 'decisions', a.id, a.topic, b.id, b.topic,
         format('cos_dist %s — hai quyết định gần như giống hệt, cả hai đều chưa có outcome',
                round((a.embedding <=> b.embedding)::numeric, 4)),
         round((a.embedding <=> b.embedding)::numeric, 4)
  FROM brain.decisions a
  JOIN brain.decisions b
    ON a.id < b.id
   AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
  WHERE (a.embedding <=> b.embedding) < 0.05
    AND a.outcome IS NULL AND b.outcome IS NULL;

  --------------------------------------------------------------------
  -- Fingerprint ổn định giữa các lần chạy
  --------------------------------------------------------------------
  UPDATE _lint_f
  SET fingerprint = check_code || ':' || subcheck || ':' || object_table || ':' ||
                    COALESCE(object_id::text, object_label, '-') || ':' ||
                    COALESCE(related_id::text, related_label, '-');

  --------------------------------------------------------------------
  -- Persist
  --------------------------------------------------------------------
  IF p_persist THEN
    INSERT INTO brain.lint_findings AS lf (
      fingerprint, run_id, run_date, check_code, subcheck, severity,
      object_table, object_id, object_label, related_id, related_label, detail, metric
    )
    SELECT f.fingerprint, v_run_id, CURRENT_DATE, f.check_code, f.subcheck, f.severity,
           f.object_table, f.object_id, f.object_label, f.related_id, f.related_label, f.detail, f.metric
    FROM _lint_f f
    ON CONFLICT (fingerprint) DO UPDATE
      SET run_id       = EXCLUDED.run_id,
          run_date     = EXCLUDED.run_date,
          severity     = EXCLUDED.severity,
          detail       = EXCLUDED.detail,
          metric       = EXCLUDED.metric,
          last_seen_at = now(),
          status       = CASE WHEN lf.status IN ('fixed','auto_resolved') THEN 'reopened' ELSE lf.status END,
          resolved_at  = CASE WHEN lf.status IN ('fixed','auto_resolved') THEN NULL ELSE lf.resolved_at END;

    -- Mục lần trước có, lần này không còn => đã tự hết
    UPDATE brain.lint_findings
    SET status = 'auto_resolved', resolved_at = now()
    WHERE status IN ('open','reopened','accepted')
      AND fingerprint NOT IN (SELECT f.fingerprint FROM _lint_f f);
  END IF;

  RETURN QUERY
  SELECT f.severity, f.check_code, f.subcheck, f.object_table, f.object_label,
         f.related_label, f.detail, f.metric,
         COALESCE(lf.status, 'open')::text,
         COALESCE(lf.first_seen_at::date, CURRENT_DATE)
  FROM _lint_f f
  LEFT JOIN brain.lint_findings lf ON lf.fingerprint = f.fingerprint
  WHERE COALESCE(lf.status, 'open') <> 'ignored'
  ORDER BY CASE f.severity WHEN 'red' THEN 1 WHEN 'orange' THEN 2 ELSE 3 END,
           f.check_code, f.subcheck, f.metric DESC NULLS LAST;
END;
$fn$;

COMMENT ON FUNCTION brain.lint_run(boolean, text) IS
  'brain-lint Giai đoạn 2 — chạy Check A (embedding), B (orphan/ref gãy), C (hết hạn/stale), D (trùng/mâu thuẫn). CHỈ ĐỌC brain.knowledge/decisions/artifacts; chỉ ghi vào brain.lint_findings. p_persist=false để chạy thử không lưu.';

REVOKE ALL ON FUNCTION brain.lint_run(boolean, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION brain.lint_run(boolean, text) TO service_role;