
-- RPC: get_tax_threshold_summary
-- Mục đích: Trả về doanh thu luỹ kế năm (merge v_s1a_hkd + revenue_manual_log),
-- % so với ngưỡng 1 tỷ (Nghị định 141/2026 Nhóm I), và dự báo cuối năm.
-- Read-only, SECURITY DEFINER để bypass RLS đọc 2 nguồn an toàn (không mutate).

CREATE OR REPLACE FUNCTION public.get_tax_threshold_summary(p_year INT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
  v_threshold BIGINT := 1000000000; -- 1 tỷ
  v_pms_total BIGINT;
  v_manual_total BIGINT;
  v_total BIGINT;
  v_months_with_data INT;
  v_avg_per_month NUMERIC;
  v_months_remaining INT;
  v_forecast_total BIGINT;
  v_current_month INT := EXTRACT(MONTH FROM CURRENT_DATE)::INT;
  v_current_year INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  v_by_month JSON;
  v_status TEXT;
BEGIN
  -- Doanh thu PMS theo S1a (đã loại trừ dịch vụ partner, đúng công thức S1a)
  SELECT COALESCE(SUM(so_tien), 0) INTO v_pms_total
  FROM v_s1a_hkd
  WHERE nam = v_year;

  -- Doanh thu nhập tay (cash/tour/OTA chưa sync)
  SELECT COALESCE(SUM(amount), 0) INTO v_manual_total
  FROM revenue_manual_log
  WHERE EXTRACT(YEAR FROM period) = v_year;

  v_total := v_pms_total + v_manual_total;

  -- Breakdown theo tháng (merge 2 nguồn) — dùng cho mini chart frontend
  WITH pms_m AS (
    SELECT thang, SUM(so_tien) AS tong
    FROM v_s1a_hkd WHERE nam = v_year
    GROUP BY thang
  ),
  manual_m AS (
    SELECT EXTRACT(MONTH FROM period)::INT AS thang, SUM(amount) AS tong
    FROM revenue_manual_log
    WHERE EXTRACT(YEAR FROM period) = v_year
    GROUP BY EXTRACT(MONTH FROM period)
  ),
  merged AS (
    SELECT COALESCE(p.thang, m.thang) AS thang,
           COALESCE(p.tong, 0) + COALESCE(m.tong, 0) AS tong
    FROM pms_m p FULL OUTER JOIN manual_m m ON p.thang = m.thang
  )
  SELECT json_agg(json_build_object('thang', thang, 'doanh_thu', tong) ORDER BY thang)
  INTO v_by_month
  FROM merged;

  -- Dự báo: chỉ tính nếu đang xem năm hiện tại và có ít nhất 1 tháng dữ liệu
  IF v_year = v_current_year THEN
    SELECT COUNT(DISTINCT thang) INTO v_months_with_data
    FROM v_s1a_hkd WHERE nam = v_year AND thang <= v_current_month;

    IF v_months_with_data > 0 THEN
      v_avg_per_month := v_total::NUMERIC / v_months_with_data;
      v_months_remaining := 12 - v_current_month;
      v_forecast_total := v_total + ROUND(v_avg_per_month * v_months_remaining);
    ELSE
      v_forecast_total := v_total;
    END IF;
  ELSE
    -- Năm đã qua: không dự báo, forecast = total thực tế
    v_forecast_total := v_total;
  END IF;

  -- Trạng thái cảnh báo theo ngưỡng (dựa trên luỹ kế thực tế, không phải dự báo)
  v_status := CASE
    WHEN v_total > v_threshold THEN 'red'
    WHEN v_total >= 800000000 THEN 'yellow'
    ELSE 'green'
  END;

  RETURN json_build_object(
    'year', v_year,
    'pms_total', v_pms_total,
    'manual_total', v_manual_total,
    'total', v_total,
    'threshold', v_threshold,
    'percent_of_threshold', ROUND((v_total::NUMERIC / v_threshold * 100), 1),
    'remaining_to_threshold', v_threshold - v_total,
    'status', v_status,
    'forecast_total', v_forecast_total,
    'forecast_exceeds_threshold', v_forecast_total > v_threshold,
    'is_current_year', v_year = v_current_year,
    'by_month', COALESCE(v_by_month, '[]'::json)
  );
END;
$$;

-- GRANT theo nguyên tắc bắt buộc — chỉ authenticated (Owner+Staff) được đọc, anon không
GRANT EXECUTE ON FUNCTION public.get_tax_threshold_summary(INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_tax_threshold_summary(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tax_threshold_summary(INT) FROM public;
