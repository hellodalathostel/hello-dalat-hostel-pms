-- Bo sung catch rieng cho loi exclusion_violation (constraint no_overlapping_bookings_from_20260705)
-- Ly do can du da co check_room_availability: race condition 2 request dong thoi
-- van co the vuot qua check truoc INSERT -> constraint DB la lop chan cuoi cung.
CREATE FUNCTION public.add_booking_to_group_txn(
  p_group_id UUID,
  p_room_id TEXT,
  p_check_in DATE,
  p_check_out DATE,
  p_price_per_night INTEGER,
  p_guests_count INTEGER,
  p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_nights      INTEGER;
  v_guest_name  TEXT;
  v_avail       RECORD;
  v_booking_id  UUID;
  v_group_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM groups
    WHERE id = p_group_id AND (is_deleted = false OR is_deleted IS NULL)
  ) INTO v_group_exists;

  IF NOT v_group_exists THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND: Group % không tồn tại hoặc đã bị xóa.', p_group_id
      USING ERRCODE = 'P0005';
  END IF;

  v_nights := (p_check_out - p_check_in);
  IF v_nights < 1 THEN
    RAISE EXCEPTION 'INVALID_NIGHTS: check_out phải sau check_in ít nhất 1 ngày (phòng %)', p_room_id
      USING ERRCODE = 'P0004';
  END IF;

  SELECT * INTO v_avail
    FROM check_room_availability(p_room_id, p_check_in, p_check_out, NULL);

  IF NOT v_avail.available THEN
    RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % bị xung đột (% — % đến %)',
      p_room_id, v_avail.conflict_type,
      v_avail.conflict_check_in, v_avail.conflict_check_out
      USING ERRCODE = 'P0001';
  END IF;

  SELECT customer_name INTO v_guest_name
    FROM groups WHERE id = p_group_id;

  INSERT INTO bookings (
    group_id, room_id, check_in, check_out,
    price_per_night, guests_count, guest_name, note
  )
  VALUES (
    p_group_id, p_room_id, p_check_in, p_check_out,
    p_price_per_night, p_guests_count, v_guest_name, p_note
  )
  RETURNING id INTO v_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success', TRUE,
    'booking_id', v_booking_id,
    'group_id', p_group_id
  );
EXCEPTION
  WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % đã có booking khác trùng ngày (% đến %). Vui lòng chọn phòng hoặc ngày khác.',
      p_room_id, p_check_in, p_check_out
      USING ERRCODE = 'P0007';
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE FUNCTION public.update_booking_txn(
  p_booking_id UUID,
  p_room_id TEXT DEFAULT NULL,
  p_check_in DATE DEFAULT NULL,
  p_check_out DATE DEFAULT NULL,
  p_price_per_night INTEGER DEFAULT NULL,
  p_guests_count INTEGER DEFAULT NULL,
  p_guest_name TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_cancel BOOLEAN DEFAULT false,
  p_override_checkin BOOLEAN DEFAULT false
)
RETURNS JSON
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

-- Bat buoc theo rule migration: REVOKE tu PUBLIC, chi grant lai cho role can thiet
REVOKE EXECUTE ON FUNCTION public.add_booking_to_group_txn(uuid, text, date, date, integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_booking_txn(uuid, text, date, date, integer, integer, text, text, boolean, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.add_booking_to_group_txn(uuid, text, date, date, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_booking_txn(uuid, text, date, date, integer, integer, text, text, boolean, boolean) TO authenticated;
