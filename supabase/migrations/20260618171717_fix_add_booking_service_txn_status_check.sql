
-- Fix bug: add_booking_service_txn check status IN ('confirmed', 'checked-in')
-- nhưng booking_status enum không có giá trị 'confirmed' (chỉ có booked|checked-in|checked-out|cancelled)
-- => booking ở status 'booked' (vừa tạo, chưa check-in) bị từ chối thêm dịch vụ — bug thật, Hiếu xác nhận đã gặp.
-- Fix: đổi 'confirmed' thành 'booked' để khớp đúng enum thật.

CREATE OR REPLACE FUNCTION public.add_booking_service_txn(
  p_booking_id uuid,
  p_service_id text DEFAULT NULL::text,
  p_qty numeric DEFAULT 1,
  p_custom_name text DEFAULT NULL::text,
  p_custom_price integer DEFAULT NULL::integer
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking   RECORD;
  v_svc_name  TEXT;
  v_svc_price INTEGER;
BEGIN
  SELECT id, status, group_id
    INTO v_booking
    FROM bookings
   WHERE id = p_booking_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  -- Cho phép cả booked (chưa check-in) và checked-in
  IF v_booking.status NOT IN ('booked', 'checked-in') THEN
    RAISE EXCEPTION 'BOOKING_INVALID_STATUS: chỉ thêm dịch vụ khi booked hoặc checked-in, hiện tại: %',
      v_booking.status USING ERRCODE = 'P0002';
  END IF;

  IF p_service_id IS NOT NULL THEN
    SELECT name, price INTO v_svc_name, v_svc_price
      FROM services
     WHERE id = p_service_id AND is_deleted = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_NOT_FOUND: %', p_service_id USING ERRCODE = 'P0003';
    END IF;
  ELSE
    IF p_custom_name IS NULL OR p_custom_price IS NULL THEN
      RAISE EXCEPTION 'CUSTOM_SERVICE_MISSING_FIELDS: cần p_custom_name và p_custom_price' USING ERRCODE = 'P0004';
    END IF;
    v_svc_name  := p_custom_name;
    v_svc_price := p_custom_price;
  END IF;

  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QTY: qty phải > 0' USING ERRCODE = 'P0005';
  END IF;

  INSERT INTO booking_services (booking_id, service_id, name, price, qty)
  VALUES (p_booking_id, p_service_id, v_svc_name, v_svc_price, p_qty);

  -- Touch booking để fire trigger calc_booking_grand_total
  UPDATE bookings
     SET updated_at = NOW()
   WHERE id = p_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success',    TRUE,
    'booking_id', p_booking_id,
    'service',    v_svc_name,
    'qty',        p_qty,
    'amount',     v_svc_price * p_qty
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;
