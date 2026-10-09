
-- Fix: add_early_late_txn trước đây dịch chuyển check_in/check_out của booking
-- (check_in - 1 ngày cho early, check_out + 1 ngày cho late). Vì bookings.nights
-- là GENERATED ALWAYS AS (check_out - check_in), việc này khiến room_subtotal
-- (trigger-computed) cộng thêm nguyên 1 đêm phòng ngoài ý muốn.
-- Bug báo bởi Hiếu 2026-07-20 (đối chiếu hóa đơn HD-86AB0308: 4 đêm x450k lúc
-- 16:03 -> 2 đêm x450k lúc 16:39 sau khi sửa lại booking).
--
-- Fix: KHÔNG đụng check_in/check_out của booking. Thay vào đó:
--   1. Check phòng trống ở đêm liền kề (giữ nguyên logic cũ)
--   2. INSERT trực tiếp vào room_blocks cho đêm đó (reason='other') — không
--      gọi create_room_block_txn() vì hàm đó tự raise ROOM_HAS_ACTIVE_BOOKING
--      do overlap với chính booking đang xử lý (ranh giới ngày trùng nhau).
--   3. Set has_early_check_in / has_late_check_out = true (giữ nguyên)
--   4. Insert phí vào booking_services với service_id = NULL (khớp cách
--      production đã ghi nhận trước đây — 'early-check-in'/'late-check-out'
--      không tồn tại trong bảng services nên insert string sẽ vi phạm FK
--      booking_services_service_id_fkey).
--
-- Xác nhận với Hiếu 2026-07-20: CÓ tạo room_block cho đêm liền kề để tránh
-- double-book, KHÔNG đổi ngày check_in/check_out của booking.
-- Đã test bằng BEGIN...ROLLBACK trước khi apply — xem chi tiết brain.daily_log.

CREATE OR REPLACE FUNCTION public.add_early_late_txn(p_booking_id uuid, p_type text, p_fee integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking         bookings%ROWTYPE;
  v_block_date_from DATE;
  v_block_date_to   DATE;
  v_service_name    TEXT;
  v_available       BOOLEAN;
  v_conflict        RECORD;
  v_block_id        UUID;
BEGIN
  SELECT * INTO v_booking
    FROM bookings
   WHERE id = p_booking_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  IF p_type = 'early' AND v_booking.has_early_check_in = true THEN
    RAISE EXCEPTION 'early_check_in_already_applied';
  END IF;
  IF p_type = 'late' AND v_booking.has_late_check_out = true THEN
    RAISE EXCEPTION 'late_check_out_already_applied';
  END IF;

  IF p_type = 'early' THEN
    v_block_date_from := v_booking.check_in - INTERVAL '1 day';
    v_block_date_to   := v_booking.check_in;
    v_service_name := 'Early Check-in';
  ELSIF p_type = 'late' THEN
    v_block_date_from := v_booking.check_out;
    v_block_date_to   := v_booking.check_out + INTERVAL '1 day';
    v_service_name := 'Late Check-out';
  ELSE
    RAISE EXCEPTION 'invalid_type: must be early or late';
  END IF;

  SELECT available INTO v_available
    FROM check_room_availability(
      v_booking.room_id,
      v_block_date_from,
      v_block_date_to,
      p_booking_id
    );

  IF NOT v_available THEN
    RAISE EXCEPTION 'room_not_available';
  END IF;

  SELECT b.id, b.check_in, b.check_out, b.guest_name, b.status
    INTO v_conflict
    FROM bookings b
   WHERE b.room_id = v_booking.room_id
     AND b.is_deleted = FALSE
     AND b.id <> p_booking_id
     AND b.status IN ('booked', 'checked-in')
     AND b.check_in < v_block_date_to
     AND b.check_out > v_block_date_from
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ROOM_HAS_ACTIVE_BOOKING'
      USING ERRCODE = 'P0041',
      DETAIL = json_build_object(
        'booking_id', v_conflict.id,
        'guest_name', v_conflict.guest_name,
        'check_in', v_conflict.check_in,
        'check_out', v_conflict.check_out,
        'status', v_conflict.status
      )::text;
  END IF;

  INSERT INTO room_blocks (room_id, start_date, end_date, reason, note, created_by)
  VALUES (
    v_booking.room_id,
    v_block_date_from,
    v_block_date_to,
    'other',
    v_service_name || ' — ' || v_booking.guest_name || ' (booking ' || substring(p_booking_id::text, 1, 8) || ')',
    auth.uid()::text
  )
  RETURNING id INTO v_block_id;

  UPDATE bookings SET
    has_early_check_in   = CASE WHEN p_type = 'early' THEN true ELSE has_early_check_in END,
    has_late_check_out   = CASE WHEN p_type = 'late'  THEN true ELSE has_late_check_out END,
    updated_at           = now()
  WHERE id = p_booking_id;

  INSERT INTO booking_services (booking_id, service_id, name, price, qty)
  VALUES (p_booking_id, NULL, v_service_name, p_fee, 1);

  RETURN jsonb_build_object(
    'success',    true,
    'type',       p_type,
    'block_id',   v_block_id,
    'block_from', v_block_date_from,
    'block_to',   v_block_date_to,
    'fee',        p_fee
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.add_early_late_txn(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_early_late_txn(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_early_late_txn(uuid, text, integer) TO authenticated;
