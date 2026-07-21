
-- Fix: v_s1a_hkd.ngay_ghi_so (=check_out) có thể là ngày tương lai (booking đã đặt nhưng chưa trả phòng).
-- Ngưỡng pháp lý 1 tỷ phải tính trên doanh thu THỰC TẾ đã ghi sổ (ngay_ghi_so <= hôm nay),
-- không gộp booking tương lai vào số dùng để cảnh báo ngưỡng.
-- Tách riêng "actual" (dùng để cảnh báo) và "booked_future" (tham khảo, không tính ngưỡng).

CREATE OR REPLACE FUNCTION public.get_tax_threshold_summary(p_year INT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
  v_threshold BIGINT := 1000000000; -- 1 tỷ
  v_pms_actual BIGINT;       -- đã ghi sổ thực tế (check_out <= hôm nay)
  v_pms_future BIGINT;       -- đã đặt, chưa tới ngày trả phòng (tham khảo)
  v_manual_total BIGINT;     -- nhập tay (cash/tour/OTA chưa sync) — luôn coi là thực tế
  v_total_actual BIGINT;     -- số dùng để so ngưỡng pháp lý
  v_months_with_data INT;
  v_avg_per_month NUMERIC;
  v_months_remaining INT;
  v_forecast_total BIGINT;   -- actual + trung bình tháng còn lại (ước tính, KHÔNG dùng pms_future)
  v_current_month INT := EXTRACT(MONTH FROM CURRENT_DATE)::INT;
  v_current_year INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  v_by_month JSON;
  v_status TEXT;
BEGIN
  SELECT COALESCE(SUM(so_tien), 0) INTO v_pms_actual
  FROM v_s1a_hkd
  WHERE nam = v_year AND ngay_ghi_so <= CURRENT_DATE;

  SELECT COALESCE(SUM(so_tien), 0) INTO v_pms_future
  FROM v_s1a_hkd
  WHERE nam = v_year AND ngay_ghi_so > CURRENT_DATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_manual_total
  FROM revenue_manual_log
  WHERE EXTRACT(YEAR FROM period) = v_year;

  v_total_actual := v_pms_actual + v_manual_total;

  -- Breakdown theo tháng — chỉ phần ĐÃ ghi sổ thực tế (không gộp future) để biểu đồ không gây hiểu lầm
  WITH pms_m AS (
    SELECT thang, SUM(so_tien) AS tong
    FROM v_s1a_hkd WHERE nam = v_year AND ngay_ghi_so <= CURRENT_DATE
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

  -- Dự báo dựa trên trung bình tháng đã qua thực tế, không cộng pms_future (tránh đếm 2 lần)
  IF v_year = v_current_year THEN
    SELECT COUNT(DISTINCT thang) INTO v_months_with_data
    FROM v_s1a_hkd WHERE nam = v_year AND ngay_ghi_so <= CURRENT_DATE;

    IF v_months_with_data > 0 THEN
      v_avg_per_month := v_total_actual::NUMERIC / v_months_with_data;
      v_months_remaining := 12 - v_current_month;
      v_forecast_total := v_total_actual + ROUND(v_avg_per_month * v_months_remaining);
    ELSE
      v_forecast_total := v_total_actual;
    END IF;
  ELSE
    v_forecast_total := v_total_actual;
  END IF;

  v_status := CASE
    WHEN v_total_actual > v_threshold THEN 'red'
    WHEN v_total_actual >= 800000000 THEN 'yellow'
    ELSE 'green'
  END;

  RETURN json_build_object(
    'year', v_year,
    'pms_actual', v_pms_actual,
    'pms_future_booked', v_pms_future,
    'manual_total', v_manual_total,
    'total_actual', v_total_actual,
    'threshold', v_threshold,
    'percent_of_threshold', ROUND((v_total_actual::NUMERIC / v_threshold * 100), 1),
    'remaining_to_threshold', v_threshold - v_total_actual,
    'status', v_status,
    'forecast_total', v_forecast_total,
    'forecast_exceeds_threshold', v_forecast_total > v_threshold,
    'is_current_year', v_year = v_current_year,
    'by_month', COALESCE(v_by_month, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tax_threshold_summary(INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_tax_threshold_summary(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tax_threshold_summary(INT) FROM public;
