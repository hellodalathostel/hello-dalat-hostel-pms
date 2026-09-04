-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 21/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- Fix logic: check_in < stay_day <= check_out (đúng bằng nights), không phải check_in <= stay_day <= check_out (nights+1)
-- Sáng ngày check_in khách vừa tới, chưa ăn sáng; sáng ngày check_out là bữa cuối trước khi rời.

CREATE OR REPLACE FUNCTION public.recalc_breakfast_snapshot_range(p_start date, p_end date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date;
  v_unit_cost integer;
  v_free integer;
  v_paid integer;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RETURN;
  END IF;

  v_day := p_start;
  WHILE v_day <= p_end LOOP
    SELECT
      COALESCE(SUM(b.breakfast_qty_per_night) FILTER (WHERE b.breakfast_type = 'free'), 0),
      COALESCE(SUM(b.breakfast_qty_per_night) FILTER (WHERE b.breakfast_type = 'paid'), 0)
    INTO v_free, v_paid
    FROM public.bookings b
    WHERE b.has_breakfast = true
      AND b.is_deleted = false
      AND b.status <> 'cancelled'
      AND v_day > b.check_in
      AND v_day <= b.check_out;

    v_unit_cost := public.get_breakfast_unit_cost(v_day);

    INSERT INTO public.breakfast_daily_snapshot (snapshot_date, total_qty_free, total_qty_paid, unit_cost_snapshot, cogs_amount, updated_at)
    VALUES (v_day, v_free, v_paid, v_unit_cost, (v_free + v_paid) * v_unit_cost, now())
    ON CONFLICT (snapshot_date) DO UPDATE SET
      total_qty_free = EXCLUDED.total_qty_free,
      total_qty_paid = EXCLUDED.total_qty_paid,
      unit_cost_snapshot = EXCLUDED.unit_cost_snapshot,
      cogs_amount = EXCLUDED.cogs_amount,
      updated_at = now();

    v_day := v_day + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_breakfast_snapshot_range(date, date) FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.bookings.breakfast_qty_per_night IS 'Số suất/đêm, áp dụng đều cho mọi đêm thực ở: (check_in, check_out] — sáng check_in KHÔNG tính (khách chưa ở qua đêm), sáng check_out CÓ tính (bữa cuối trước khi rời). Tổng suất = qty_per_night × nights.';