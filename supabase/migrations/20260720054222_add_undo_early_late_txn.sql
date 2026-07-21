-- Adds undo_early_late_txn: reverts an applied Early Check-in / Late Check-out.
--
-- Deletes the associated booking_services fee row and room_blocks row (if any
-- — bookings created before the add_early_late_txn no-date-shift fix won't
-- have a matching block), then resets has_early_check_in/has_late_check_out.
-- Blocked on checked-out/cancelled bookings.
BEGIN;

CREATE OR REPLACE FUNCTION public.undo_early_late_txn(p_booking_id uuid, p_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking         bookings%ROWTYPE;
  v_service_name    TEXT;
  v_block_from      DATE;
  v_block_to        DATE;
  v_service_row_id  UUID;
  v_block_row_id    UUID;
  v_service_deleted BOOLEAN := false;
  v_block_deleted   BOOLEAN := false;
BEGIN
  SELECT * INTO v_booking
    FROM bookings
   WHERE id = p_booking_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  IF v_booking.status IN ('checked-out', 'cancelled') THEN
    RAISE EXCEPTION 'booking_locked: khong the undo early/late tren booking da checked-out hoac cancelled';
  END IF;

  IF p_type = 'early' THEN
    IF v_booking.has_early_check_in = false THEN
      RAISE EXCEPTION 'early_check_in_not_applied';
    END IF;
    v_service_name := 'Early Check-in';
    v_block_from := v_booking.check_in - INTERVAL '1 day';
    v_block_to   := v_booking.check_in;
  ELSIF p_type = 'late' THEN
    IF v_booking.has_late_check_out = false THEN
      RAISE EXCEPTION 'late_check_out_not_applied';
    END IF;
    v_service_name := 'Late Check-out';
    v_block_from := v_booking.check_out;
    v_block_to   := v_booking.check_out + INTERVAL '1 day';
  ELSE
    RAISE EXCEPTION 'invalid_type: must be early or late';
  END IF;

  SELECT id INTO v_service_row_id
    FROM booking_services
   WHERE booking_id = p_booking_id AND name = v_service_name
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_service_row_id IS NOT NULL THEN
    PERFORM delete_booking_service_txn(v_service_row_id);
    v_service_deleted := true;
  END IF;

  SELECT id INTO v_block_row_id
    FROM room_blocks
   WHERE room_id = v_booking.room_id
     AND start_date = v_block_from
     AND end_date = v_block_to
     AND note LIKE '%' || substring(p_booking_id::text, 1, 8) || '%'
   LIMIT 1;

  IF v_block_row_id IS NOT NULL THEN
    PERFORM delete_room_block_txn(v_block_row_id);
    v_block_deleted := true;
  END IF;

  UPDATE bookings SET
    has_early_check_in = CASE WHEN p_type = 'early' THEN false ELSE has_early_check_in END,
    has_late_check_out = CASE WHEN p_type = 'late'  THEN false ELSE has_late_check_out END,
    updated_at = now()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'type', p_type,
    'service_deleted', v_service_deleted,
    'block_deleted', v_block_deleted
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.undo_early_late_txn(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_early_late_txn(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.undo_early_late_txn(uuid, text) TO authenticated, service_role;

COMMIT;
