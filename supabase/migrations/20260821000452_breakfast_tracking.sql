-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 21/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- 1) Thêm cột vào bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS has_breakfast boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS breakfast_type text,
  ADD COLUMN IF NOT EXISTS breakfast_qty_per_night integer NOT NULL DEFAULT 0;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_breakfast_type_check
  CHECK (breakfast_type IS NULL OR breakfast_type IN ('free', 'paid'));

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_breakfast_qty_check
  CHECK (breakfast_qty_per_night >= 0);

COMMENT ON COLUMN public.bookings.has_breakfast IS 'Booking có đăng ký ăn sáng không';
COMMENT ON COLUMN public.bookings.breakfast_type IS 'free hoặc paid, NULL nếu has_breakfast=false';
COMMENT ON COLUMN public.bookings.breakfast_qty_per_night IS 'Số suất/đêm, áp dụng đều cho mọi ngày trong [check_in, check_out] — bao gồm cả sáng ngày check_out';

-- 2) Bảng lịch sử giá vốn/suất ăn sáng
CREATE TABLE public.breakfast_price_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_cost integer NOT NULL CHECK (unit_cost >= 0),
  effective_from date NOT NULL,
  created_by uuid REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (effective_from)
);

COMMENT ON TABLE public.breakfast_price_history IS 'Lịch sử giá vốn/suất ăn sáng, dùng để tính COGS theo từng thời kỳ';

ALTER TABLE public.breakfast_price_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.breakfast_price_history TO authenticated;
GRANT SELECT ON public.breakfast_price_history TO anon;
REVOKE INSERT, UPDATE, DELETE ON public.breakfast_price_history FROM anon, authenticated;

CREATE POLICY breakfast_price_history_select ON public.breakfast_price_history
  FOR SELECT TO authenticated, anon USING (true);

-- 3) Bảng snapshot theo ngày (tổng hợp toàn bộ booking active mỗi ngày)
CREATE TABLE public.breakfast_daily_snapshot (
  snapshot_date date PRIMARY KEY,
  total_qty_free integer NOT NULL DEFAULT 0,
  total_qty_paid integer NOT NULL DEFAULT 0,
  unit_cost_snapshot integer NOT NULL DEFAULT 0,
  cogs_amount integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.breakfast_daily_snapshot IS 'Snapshot tổng số suất ăn sáng mỗi ngày (free+paid), auto-cập nhật qua trigger trên bookings. cogs_amount = (total_qty_free + total_qty_paid) * unit_cost_snapshot';

ALTER TABLE public.breakfast_daily_snapshot ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.breakfast_daily_snapshot TO authenticated;
GRANT SELECT ON public.breakfast_daily_snapshot TO anon;
REVOKE INSERT, UPDATE, DELETE ON public.breakfast_daily_snapshot FROM anon, authenticated;

CREATE POLICY breakfast_daily_snapshot_select ON public.breakfast_daily_snapshot
  FOR SELECT TO authenticated, anon USING (true);

-- 4) Function: lấy unit_cost hiệu lực tại 1 ngày cụ thể
CREATE OR REPLACE FUNCTION public.get_breakfast_unit_cost(p_date date)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT unit_cost FROM public.breakfast_price_history
     WHERE effective_from <= p_date
     ORDER BY effective_from DESC
     LIMIT 1),
    0
  );
$$;

-- 5) Function: tính lại snapshot cho 1 khoảng ngày (quét toàn bộ booking active)
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
      AND v_day >= b.check_in
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

-- 6) Trigger: khi booking đổi cờ ăn sáng / ngày ở / trạng thái huỷ → tính lại snapshot cho range cũ ∪ mới
CREATE OR REPLACE FUNCTION public.trg_recalc_breakfast_on_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_date date;
  v_max_date date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.has_breakfast THEN
      PERFORM public.recalc_breakfast_snapshot_range(NEW.check_in, NEW.check_out);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.has_breakfast IS DISTINCT FROM OLD.has_breakfast
     OR NEW.breakfast_type IS DISTINCT FROM OLD.breakfast_type
     OR NEW.breakfast_qty_per_night IS DISTINCT FROM OLD.breakfast_qty_per_night
     OR NEW.check_in IS DISTINCT FROM OLD.check_in
     OR NEW.check_out IS DISTINCT FROM OLD.check_out
     OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
     OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    v_min_date := LEAST(OLD.check_in, NEW.check_in);
    v_max_date := GREATEST(OLD.check_out, NEW.check_out);
    IF v_max_date >= v_min_date THEN
      PERFORM public.recalc_breakfast_snapshot_range(v_min_date, v_max_date);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS breakfast_recalc_trigger ON public.bookings;
CREATE TRIGGER breakfast_recalc_trigger
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recalc_breakfast_on_booking_change();

-- 7) RPC: cập nhật cờ ăn sáng cho 1 booking (mutation entrypoint từ frontend)
CREATE OR REPLACE FUNCTION public.update_booking_breakfast_txn(
  p_booking_id uuid,
  p_has_breakfast boolean,
  p_breakfast_type text DEFAULT NULL,
  p_qty_per_night integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  IF p_has_breakfast AND p_breakfast_type IS NULL THEN
    RAISE EXCEPTION 'breakfast_type bắt buộc khi has_breakfast = true';
  END IF;

  IF p_has_breakfast AND p_breakfast_type NOT IN ('free', 'paid') THEN
    RAISE EXCEPTION 'breakfast_type phải là free hoặc paid';
  END IF;

  IF p_has_breakfast AND p_qty_per_night <= 0 THEN
    RAISE EXCEPTION 'breakfast_qty_per_night phải > 0 khi has_breakfast = true';
  END IF;

  UPDATE public.bookings
  SET
    has_breakfast = p_has_breakfast,
    breakfast_type = CASE WHEN p_has_breakfast THEN p_breakfast_type ELSE NULL END,
    breakfast_qty_per_night = CASE WHEN p_has_breakfast THEN p_qty_per_night ELSE 0 END,
    updated_at = now()
  WHERE id = p_booking_id AND is_deleted = false
  RETURNING json_build_object(
    'id', id,
    'has_breakfast', has_breakfast,
    'breakfast_type', breakfast_type,
    'breakfast_qty_per_night', breakfast_qty_per_night
  ) INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Booking không tồn tại hoặc đã bị xoá: %', p_booking_id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_booking_breakfast_txn(uuid, boolean, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_booking_breakfast_txn(uuid, boolean, text, integer) TO authenticated;

-- 8) RPC: set giá vốn/suất mới (có hiệu lực từ ngày X)
CREATE OR REPLACE FUNCTION public.set_breakfast_price_txn(
  p_unit_cost integer,
  p_effective_from date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  IF p_unit_cost < 0 THEN
    RAISE EXCEPTION 'unit_cost không được âm';
  END IF;

  INSERT INTO public.breakfast_price_history (unit_cost, effective_from, created_by)
  VALUES (p_unit_cost, p_effective_from, auth.uid())
  ON CONFLICT (effective_from) DO UPDATE SET unit_cost = EXCLUDED.unit_cost
  RETURNING json_build_object('id', id, 'unit_cost', unit_cost, 'effective_from', effective_from) INTO v_result;

  PERFORM public.recalc_breakfast_snapshot_range(p_effective_from, CURRENT_DATE);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_breakfast_price_txn(integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_breakfast_price_txn(integer, date) TO authenticated;

-- 9) Seed giá khởi tạo
INSERT INTO public.breakfast_price_history (unit_cost, effective_from)
VALUES (15000, CURRENT_DATE);
