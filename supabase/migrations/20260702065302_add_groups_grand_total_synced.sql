-- Audit backlog #7 (2026-06-26): groups.grand_total không tồn tại, FE tự SUM ở 3 chỗ.
-- Fix: thêm column, backfill, và mở rộng trigger sync_group_net_revenue() để ghi luôn grand_total.
-- Đồng thời attach trigger này lên bookings (trước đây chỉ có trên payment_history)
-- để net_revenue/grand_total cập nhật ngay khi thêm service/discount/cancel — không cần chờ payment event.

-- 1. Thêm column
ALTER TABLE public.groups ADD COLUMN grand_total INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill dữ liệu hiện có
UPDATE public.groups g
SET grand_total = COALESCE((
  SELECT SUM(b.grand_total)
  FROM public.bookings b
  WHERE b.group_id = g.id
    AND b.is_deleted = FALSE
    AND b.status != 'cancelled'
), 0);

-- 3. Mở rộng trigger function: ghi thêm grand_total cùng lúc với net_revenue
CREATE OR REPLACE FUNCTION public.sync_group_net_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_group_id    UUID;
  v_total_grand INTEGER;
  v_fee_rate    NUMERIC;
  v_net         INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_group_id := OLD.group_id;
  ELSE
    v_group_id := NEW.group_id;
  END IF;

  SELECT channel_fee_rate INTO v_fee_rate
    FROM public.groups
   WHERE id = v_group_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(grand_total), 0) INTO v_total_grand
    FROM public.bookings
   WHERE group_id   = v_group_id
     AND is_deleted = FALSE
     AND status    != 'cancelled';

  v_net := ROUND(v_total_grand * (1.0 - v_fee_rate));

  UPDATE public.groups
     SET grand_total = v_total_grand,
         net_revenue  = v_net,
         updated_at   = NOW()
   WHERE id = v_group_id;

  RETURN NULL;
END;
$function$;

-- 4. Attach thêm trigger trên bookings (giữ nguyên trigger cũ trên payment_history)
CREATE TRIGGER trg_bookings_sync_group_totals
AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_group_net_revenue();