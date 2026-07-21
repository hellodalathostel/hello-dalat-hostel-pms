-- Fix: add_early_late_txn insert service_id = 'early-check-in'/'late-check-out'
-- nhung 2 gia tri nay khong ton tai trong bang services -> vi pham FK constraint
-- booking_services_service_id_fkey (23503). Bug co san tu truoc, chi lo ra khi
-- nut Early/Late duoc mo cho status 'booked' va thuc su duoc test lan dau.
-- Fix: dung service_id = NULL (giong nhanh custom service trong
-- add_booking_service_txn) vi day la phu phi booking-level, khong phai
-- dich vu ban trong catalog. booking_services.service_id cho phep NULL
-- (verified information_schema truoc khi patch).
CREATE OR REPLACE FUNCTION public.add_early_late_txn(p_booking_id uuid, p_type text, p_fee integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking         bookings%ROWTYPE;
  v_new_check_in    DATE;
  v_new_check_out   DATE;
  v_check_date_from DATE;
  v_check_date_to   DATE;
  v_service_name    TEXT;
  v_available       BOOLEAN;
BEGIN
  IF p_fee < 0 THEN
    RAISE EXCEPTION 'invalid_fee: fee khong duoc am';
  END IF;

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
    v_new_check_in  := v_booking.check_in - INTERVAL '1 day';
    v_new_check_out := v_booking.check_out;
    v_check_date_from := v_new_check_in;
    v_check_date_to   := v_booking.check_in;
    v_service_name := 'Early Check-in';
  ELSIF p_type = 'late' THEN
    v_new_check_in  := v_booking.check_in;
    v_new_check_out := v_booking.check_out + INTERVAL '1 day';
    v_check_date_from := v_booking.check_out;
    v_check_date_to   := v_new_check_out;
    v_service_name := 'Late Check-out';
  ELSE
    RAISE EXCEPTION 'invalid_type: must be early or late';
  END IF;

  SELECT available INTO v_available
    FROM check_room_availability(
      v_booking.room_id,
      v_check_date_from,
      v_check_date_to,
      p_booking_id
    );

  IF NOT v_available THEN
    RAISE EXCEPTION 'room_not_available';
  END IF;

  UPDATE bookings SET
    check_in             = CASE WHEN p_type = 'early' THEN v_new_check_in  ELSE check_in  END,
    check_out            = CASE WHEN p_type = 'late'  THEN v_new_check_out ELSE check_out END,
    has_early_check_in   = CASE WHEN p_type = 'early' THEN true ELSE has_early_check_in   END,
    has_late_check_out   = CASE WHEN p_type = 'late'  THEN true ELSE has_late_check_out   END,
    updated_at           = now()
  WHERE id = p_booking_id;

  -- service_id = NULL: day la phu phi booking-level, khong phai dich vu
  -- trong catalog (services table)
  INSERT INTO booking_services (booking_id, service_id, name, price, qty)
  VALUES (p_booking_id, NULL, v_service_name, p_fee, 1);

  RETURN jsonb_build_object(
    'success',        true,
    'type',           p_type,
    'new_check_in',   v_new_check_in,
    'new_check_out',  v_new_check_out,
    'fee',            p_fee
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;