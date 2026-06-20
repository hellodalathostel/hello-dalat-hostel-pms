CREATE OR REPLACE FUNCTION public.create_group_booking_txn(p_group json, p_bookings json, p_services json DEFAULT '[]'::json, p_discounts json DEFAULT '[]'::json)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id        UUID;
  v_booking_ids     UUID[];
  v_booking_id      UUID;
  v_booking         JSON;
  v_service         JSON;
  v_discount        JSON;
  v_idx             INTEGER;
  v_service_rec     RECORD;
  v_svc_price       INTEGER;
  v_avail           RECORD;
  v_check_in        DATE;
  v_check_out       DATE;
  v_room_id         TEXT;
  v_nights          INTEGER;
  v_ext_ical_uid    TEXT;
BEGIN
  INSERT INTO groups (
    customer_name, customer_phone, customer_note,
    customer_cccd, source, channel_fee_rate
  )
  VALUES (
    p_group->>'customer_name',
    p_group->>'customer_phone',
    p_group->>'customer_note',
    p_group->>'customer_cccd',
    (p_group->>'source')::booking_source,
    COALESCE((p_group->>'channel_fee_rate')::NUMERIC, 0)
  )
  RETURNING id INTO v_group_id;

  v_booking_ids := ARRAY[]::UUID[];

  FOR v_idx IN 0 .. (JSON_ARRAY_LENGTH(p_bookings) - 1) LOOP
    v_booking        := p_bookings->v_idx;
    v_room_id        := v_booking->>'room_id';
    v_check_in       := (v_booking->>'check_in')::DATE;
    v_check_out      := (v_booking->>'check_out')::DATE;
    v_nights         := (v_check_out - v_check_in);
    v_ext_ical_uid   := v_booking->>'external_ical_uid';

    IF v_nights < 1 THEN
      RAISE EXCEPTION 'INVALID_NIGHTS: check_out phải sau check_in ít nhất 1 ngày (phòng %)', v_room_id
        USING ERRCODE = 'P0004';
    END IF;

    SELECT * INTO v_avail
      FROM check_room_availability(v_room_id, v_check_in, v_check_out, NULL);

    IF NOT v_avail.available THEN
      RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % bị xung đột (% — % đến %)',
        v_room_id, v_avail.conflict_type,
        v_avail.conflict_check_in, v_avail.conflict_check_out
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO bookings (
      group_id, room_id, check_in, check_out,
      price_per_night, guests_count, guest_name, note,
      external_ical_uid
    )
    VALUES (
      v_group_id, v_room_id, v_check_in, v_check_out,
      COALESCE((v_booking->>'price_per_night')::INTEGER, 0),
      COALESCE((v_booking->>'guests_count')::INTEGER, 1),
      p_group->>'customer_name',
      v_booking->>'note',
      v_ext_ical_uid
    )
    RETURNING id INTO v_booking_id;

    v_booking_ids := v_booking_ids || v_booking_id;
  END LOOP;

  IF p_services IS NOT NULL AND JSON_ARRAY_LENGTH(p_services) > 0 THEN
    FOR v_idx IN 0 .. (JSON_ARRAY_LENGTH(p_services) - 1) LOOP
      v_service := p_services->v_idx;

      SELECT name, price INTO v_service_rec
        FROM services
       WHERE id = v_service->>'service_id' AND is_deleted = FALSE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SERVICE_NOT_FOUND: Dịch vụ % không tồn tại.', v_service->>'service_id'
          USING ERRCODE = 'P0002';
      END IF;

      -- Nếu payload có custom_price (user đã sửa tay trên UI) → ưu tiên dùng,
      -- bỏ qua giá catalog. Giữ nguyên hành vi cũ nếu custom_price không có/null.
      v_svc_price := v_service_rec.price;
      IF (v_service->>'custom_price') IS NOT NULL THEN
        v_svc_price := (v_service->>'custom_price')::INTEGER;
      END IF;

      IF v_svc_price < 0 THEN
        RAISE EXCEPTION 'INVALID_PRICE: đơn giá dịch vụ không thể âm (dịch vụ %)', v_service->>'service_id'
          USING ERRCODE = 'P0005';
      END IF;

      v_booking_id := v_booking_ids[(v_service->>'booking_index')::INTEGER + 1];
      IF v_booking_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_BOOKING_INDEX: %', v_service->>'booking_index'
          USING ERRCODE = 'P0003';
      END IF;

      INSERT INTO booking_services (booking_id, service_id, name, price, qty)
      VALUES (v_booking_id, v_service->>'service_id', v_service_rec.name,
              v_svc_price, COALESCE((v_service->>'qty')::NUMERIC, 1));
    END LOOP;
  END IF;

  IF p_discounts IS NOT NULL AND JSON_ARRAY_LENGTH(p_discounts) > 0 THEN
    FOR v_idx IN 0 .. (JSON_ARRAY_LENGTH(p_discounts) - 1) LOOP
      v_discount := p_discounts->v_idx;

      v_booking_id := v_booking_ids[(v_discount->>'booking_index')::INTEGER + 1];
      IF v_booking_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_BOOKING_INDEX: %', v_discount->>'booking_index'
          USING ERRCODE = 'P0003';
      END IF;

      INSERT INTO booking_discounts (booking_id, amount, description)
      VALUES (v_booking_id, (v_discount->>'amount')::INTEGER, v_discount->>'description');
    END LOOP;
  END IF;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'group_id', v_group_id, 'booking_ids', v_booking_ids);

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_group_booking_txn(json, json, json, json) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_booking_txn(json, json, json, json) TO authenticated, service_role;
