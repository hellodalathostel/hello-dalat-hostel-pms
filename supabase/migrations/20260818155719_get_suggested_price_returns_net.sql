-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 18/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_suggested_price(p_room_id text, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_key           TEXT;
  v_raw           TEXT;
  v_net_txt       TEXT;
  v_net           NUMERIC;
  v_month         INTEGER := EXTRACT(MONTH FROM p_date)::INTEGER;
  v_is_peak       BOOLEAN;
  v_holidays_raw  TEXT;
  v_holidays_json JSONB;
  v_holiday       JSONB;
  v_dates_parts   TEXT[];
  v_h_start       DATE;
  v_h_end         DATE;
  v_holiday_mult  NUMERIC;
  v_is_holiday    BOOLEAN := FALSE;
  v_is_vip_room   BOOLEAN;
BEGIN
  -- 1. Map phòng -> key gia_phong_* trong Brain
  v_key := CASE p_room_id
    WHEN '101' THEN 'gia_phong_101'
    WHEN '201' THEN 'gia_phong_201'
    WHEN '102' THEN 'gia_phong_102_202'
    WHEN '202' THEN 'gia_phong_102_202'
    WHEN '103' THEN 'gia_phong_103_203'
    WHEN '203' THEN 'gia_phong_103_203'
    WHEN '301' THEN 'gia_phong_301_302'
    WHEN '302' THEN 'gia_phong_301_302'
    ELSE NULL
  END;

  IF v_key IS NULL THEN
    RETURN NULL; -- phòng không có trong Brain (vd 303, đã ngừng kinh doanh)
  END IF;

  v_is_vip_room := p_room_id IN ('101', '201');

  -- 2. Lấy Net mục tiêu từ Brain
  SELECT value INTO v_raw
  FROM brain.knowledge
  WHERE key = v_key
    AND category = 'pricing'
    AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
  ORDER BY valid_from DESC
  LIMIT 1;

  IF v_raw IS NULL THEN
    RETURN NULL;
  END IF;

  v_net_txt := (regexp_match(v_raw, 'Net mục tiêu:\s*([\d,]+)'))[1];
  v_net     := replace(v_net_txt, ',', '')::NUMERIC;

  -- 3. Check ngày lễ (vn_holidays_2026_remaining)
  SELECT value INTO v_holidays_raw
  FROM brain.knowledge
  WHERE key = 'vn_holidays_2026_remaining'
    AND category = 'pricing'
    AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
  ORDER BY valid_from DESC
  LIMIT 1;

  IF v_holidays_raw IS NOT NULL THEN
    v_holidays_json := v_holidays_raw::JSONB;

    FOR v_holiday IN SELECT * FROM jsonb_array_elements(v_holidays_json->'remaining_from_jun_2026')
    LOOP
      v_dates_parts := regexp_split_to_array(v_holiday->>'dates', '\s*đến\s*');
      v_h_start := v_dates_parts[1]::DATE;
      v_h_end   := COALESCE(NULLIF(v_dates_parts[2], ''), v_dates_parts[1])::DATE;

      IF p_date BETWEEN v_h_start AND v_h_end THEN
        v_is_holiday := TRUE;
        v_holiday_mult := (v_holiday->>'multiplier')::NUMERIC;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- 4. Ngày lễ: multiplier_holiday_vip override cho 101/201, áp theo quy_tac_ap_multiplier_le
  --    ĐÃ ĐỔI 18/08/2026: trả về NET (bỏ bước chia factor để quy đổi ra Gross như bản cũ)
  IF v_is_holiday THEN
    IF v_is_vip_room THEN
      v_holiday_mult := 2.1;
    END IF;

    v_is_peak := v_month IN (10, 11, 12, 1, 2);

    IF v_is_peak THEN
      v_net := v_net * 1.15 * v_holiday_mult;
    ELSE
      v_net := v_net * v_holiday_mult;
    END IF;

    RETURN ROUND(v_net);
  END IF;

  -- 5. Ngày thường: ĐÃ ĐỔI 18/08/2026 — trả thẳng Net mục tiêu từ Brain,
  --    KHÔNG còn nhân season/weekend lên Standard Rate như bản cũ.
  RETURN ROUND(v_net);
END;
$function$;