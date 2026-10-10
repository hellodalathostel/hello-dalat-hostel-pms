CREATE OR REPLACE FUNCTION public.update_booking_txn(p_booking_id uuid, p_room_id text DEFAULT NULL::text, p_check_in date DEFAULT NULL::date, p_check_out date DEFAULT NULL::date, p_price_per_night integer DEFAULT NULL::integer, p_guests_count integer DEFAULT NULL::integer, p_guest_name text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_cancel boolean DEFAULT false, p_override_checkin boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_booking   RECORD;
  v_avail     RECORD;
  v_new_room  TEXT;
  v_new_ci    DATE;
  v_new_co    DATE;
  v_role      user_role;
BEGIN
  v_role := current_user_role();

  SELECT id, status, room_id, check_in, check_out, is_deleted
    INTO v_booking
    FROM bookings
   WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.is_deleted THEN
    RAISE EXCEPTION 'BOOKING_DELETED' USING ERRCODE = 'P0003';
  END IF;

  IF v_booking.status = 'checked-in' THEN
    IF NOT p_override_checkin THEN
      RAISE EXCEPTION 'BOOKING_NOT_EDITABLE: Booking đang checked-in, cần xác nhận override.'
        USING ERRCODE = 'P0002';
    END IF;
    IF v_role != 'owner' THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Chỉ Owner mới được sửa booking đang checked-in.'
        USING ERRCODE = 'P0006';
    END IF;
  ELSIF v_booking.status NOT IN ('booked') THEN
    RAISE EXCEPTION 'BOOKING_NOT_EDITABLE: status % không thể sửa.',
      v_booking.status USING ERRCODE = 'P0002';
  END IF;

  -- AUDIT: gan nhan nguon cho trigger log_booking_audit (chi co hieu luc trong transaction nay)
  PERFORM set_config('app.audit_source', 'update_booking_txn', true);

  IF p_cancel THEN
    UPDATE bookings
       SET status     = 'cancelled',
           is_deleted = TRUE,
           updated_at = NOW()
     WHERE id = p_booking_id;

    RETURN json_build_object(
      'success', true,
      'action', 'cancelled',
      'booking_id', p_booking_id
    );
  END IF;

  v_new_room := COALESCE(p_room_id, v_booking.room_id);
  v_new_ci   := COALESCE(p_check_in, v_booking.check_in);
  v_new_co   := COALESCE(p_check_out, v_booking.check_out);

  IF v_new_co <= v_new_ci THEN
    RAISE EXCEPTION 'INVALID_DATES: check_out phải sau check_in' USING ERRCODE = 'P0004';
  END IF;

  SELECT * INTO v_avail
    FROM check_room_availability(v_new_room, v_new_ci, v_new_co, p_booking_id);

  IF NOT v_avail.available THEN
    RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % bị xung đột (% — % đến %)',
      v_new_room, v_avail.conflict_type,
      v_avail.conflict_check_in, v_avail.conflict_check_out
      USING ERRCODE = 'P0005';
  END IF;

  UPDATE bookings SET
    room_id       = v_new_room,
    check_in      = v_new_ci,
    check_out     = v_new_co,
    price_per_night = COALESCE(p_price_per_night, price_per_night),
    guests_count  = COALESCE(p_guests_count, guests_count),
    guest_name    = COALESCE(p_guest_name, guest_name),
    note          = COALESCE(p_note, note),
    updated_at    = NOW()
  WHERE id = p_booking_id;

  RETURN json_build_object(
    'success', true,
    'action', 'updated',
    'booking_id', p_booking_id,
    'room_id', v_new_room,
    'check_in', v_new_ci,
    'check_out', v_new_co
  );

EXCEPTION
  WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % đã có booking khác trùng ngày (% đến %). Vui lòng chọn phòng hoặc ngày khác.',
      v_new_room, v_new_ci, v_new_co
      USING ERRCODE = 'P0007';
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;
