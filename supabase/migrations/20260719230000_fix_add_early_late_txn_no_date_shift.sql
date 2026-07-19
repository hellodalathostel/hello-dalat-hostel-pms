-- Fix add_early_late_txn: stop shifting booking.check_in/check_out.
--
-- bookings.nights is a GENERATED column (check_out - check_in), so extending
-- check_in/check_out to "reserve" the adjacent night silently added an extra
-- night of room_subtotal on top of the early/late fee.
--
-- Now inserts a room_blocks row for the adjacent night instead of touching
-- the booking's own check_in/check_out. nights/room_subtotal/grand_total stay
-- correct; only the early/late service fee is added via booking_services.
--
-- booking_services.service_id is inserted as NULL (previously a synthetic
-- 'early-check-in'/'late-check-out' string) since no such row exists in the
-- services table and a non-null value would violate the FK.
BEGIN;

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

COMMIT;
