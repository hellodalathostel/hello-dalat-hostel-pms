-- supabase/migrations/20260618000002_create_discount_service_delete_rpcs.sql
-- Mục đích: Codex review High finding #4 — frontend đang INSERT/DELETE trực tiếp
-- vào booking_services/booking_discounts, bypass validation. Tạo RPC transactional
-- cho add_discount, delete_service, delete_discount; sau đó REVOKE write trực tiếp.

-- ============================================================================
-- 1. add_discount_txn — thêm giảm giá, validate amount > 0 và <= room_subtotal
-- ============================================================================
CREATE OR REPLACE FUNCTION public.add_discount_txn(
  p_booking_id uuid,
  p_amount integer,
  p_description text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT id, status, group_id, room_subtotal
    INTO v_booking
    FROM bookings
   WHERE id = p_booking_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status NOT IN ('booked', 'checked-in') THEN
    RAISE EXCEPTION 'BOOKING_INVALID_STATUS: chỉ thêm giảm giá khi booked hoặc checked-in, hiện tại: %',
      v_booking.status USING ERRCODE = 'P0002';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount phải > 0' USING ERRCODE = 'P0003';
  END IF;

  IF p_amount > v_booking.room_subtotal THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_SUBTOTAL: giảm giá (%) không được vượt room_subtotal (%)',
      p_amount, v_booking.room_subtotal USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO booking_discounts (booking_id, amount, description)
  VALUES (p_booking_id, p_amount, p_description);

  UPDATE bookings SET updated_at = NOW() WHERE id = p_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success',    TRUE,
    'booking_id', p_booking_id,
    'amount',     p_amount
  );
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_discount_txn(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_discount_txn(uuid, integer, text) TO authenticated, service_role;

-- ============================================================================
-- 2. delete_booking_service_txn — xóa 1 dòng booking_services
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_booking_service_txn(
  p_service_row_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
BEGIN
  SELECT bs.id, bs.booking_id, b.is_deleted
    INTO v_row
    FROM booking_services bs
    JOIN bookings b ON b.id = bs.booking_id
   WHERE bs.id = p_service_row_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_ROW_NOT_FOUND: %', p_service_row_id USING ERRCODE = 'P0001';
  END IF;

  IF v_row.is_deleted THEN
    RAISE EXCEPTION 'BOOKING_DELETED: không thể sửa dịch vụ của booking đã xóa' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM booking_services WHERE id = p_service_row_id;

  UPDATE bookings SET updated_at = NOW() WHERE id = v_row.booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success',    TRUE,
    'booking_id', v_row.booking_id,
    'deleted_id', p_service_row_id
  );
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_booking_service_txn(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_booking_service_txn(uuid) TO authenticated, service_role;

-- ============================================================================
-- 3. delete_booking_discount_txn — xóa 1 dòng booking_discounts
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_booking_discount_txn(
  p_discount_row_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
BEGIN
  SELECT bd.id, bd.booking_id, b.is_deleted
    INTO v_row
    FROM booking_discounts bd
    JOIN bookings b ON b.id = bd.booking_id
   WHERE bd.id = p_discount_row_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISCOUNT_ROW_NOT_FOUND: %', p_discount_row_id USING ERRCODE = 'P0001';
  END IF;

  IF v_row.is_deleted THEN
    RAISE EXCEPTION 'BOOKING_DELETED: không thể sửa giảm giá của booking đã xóa' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM booking_discounts WHERE id = p_discount_row_id;

  UPDATE bookings SET updated_at = NOW() WHERE id = v_row.booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success',    TRUE,
    'booking_id', v_row.booking_id,
    'deleted_id', p_discount_row_id
  );
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_booking_discount_txn(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_booking_discount_txn(uuid) TO authenticated, service_role;

-- ============================================================================
-- 4. REVOKE write trực tiếp trên booking_services / booking_discounts
--    Chỉ giữ SELECT (đọc) — mọi write phải qua RPC ở trên.
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON public.booking_services FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.booking_discounts FROM anon, authenticated;
-- service_role giữ nguyên full access (Edge Functions cần dùng trực tiếp nếu có)
