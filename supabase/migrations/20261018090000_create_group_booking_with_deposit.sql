-- F01: Tạo booking + cọc trong CÙNG một transaction.
--
-- Trước đây frontend gọi create_group_booking_txn rồi gọi record_payment_txn riêng cho cọc.
-- Nếu bước 2 lỗi, group/bookings đã được lưu nhưng UI báo "Không thể tạo booking" → nhân viên
-- bấm lại, rủi ro trùng phòng hoặc booking mồ côi không có cọc.
--
-- Giờ thêm tham số p_deposit jsonb DEFAULT NULL ({ amount, method, note }); bên trong gọi
-- record_payment_txn (tái sử dụng toàn bộ logic thanh toán: overpayment guard, phụ phí thẻ 4%).
-- Lỗi ở bước cọc rollback luôn group + bookings + services + discounts.
--
-- Tương thích ngược: p_deposit có DEFAULT NULL nên frontend cũ (không truyền) vẫn chạy.
-- Thân hàm giữ nguyên bản đang chạy trên DB (lấy bằng pg_get_functiondef ngày 2026-10-18),
-- chỉ thêm tham số p_deposit và khối ghi cọc ngay trước RETURN.
--
-- Bắt buộc DROP chữ ký cũ: nếu chỉ CREATE OR REPLACE với thêm tham số sẽ sinh overload,
-- PostgREST gọi RPC bị mơ hồ.

BEGIN;

DROP FUNCTION public.create_group_booking_txn(json, json, json, json);

CREATE FUNCTION public.create_group_booking_txn(
  p_group json,
  p_bookings json,
  p_services json DEFAULT '[]'::json,
  p_discounts json DEFAULT '[]'::json,
  p_deposit jsonb DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  v_deposit_amount  INTEGER;
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

      -- MỚI: nếu payload có custom_price (user đã sửa tay trên UI) → ưu tiên dùng,
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

  -- F01: ghi cọc trong cùng transaction với tạo group/bookings.
  -- Lỗi ở đây (vượt số dư, method không hợp lệ...) sẽ rollback toàn bộ (group + bookings),
  -- không để lại booking mồ côi. grand_total của group đã được trigger tính xong ở các
  -- câu INSERT phía trên nên overpayment guard của record_payment_txn kiểm tra đúng.
  -- p_first_booking_id luôn truyền booking đầu tiên; record_payment_txn chỉ dùng khi method = card.
  v_deposit_amount := COALESCE((p_deposit->>'amount')::INTEGER, 0);
  IF p_deposit IS NOT NULL AND v_deposit_amount > 0 THEN
    PERFORM public.record_payment_txn(
      v_group_id,
      v_deposit_amount,
      COALESCE(NULLIF(p_deposit->>'method', ''), 'cash')::payment_method,
      NULLIF(p_deposit->>'note', ''),
      v_booking_ids[1]
    );
  END IF;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'group_id', v_group_id, 'booking_ids', v_booking_ids);

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

-- DROP làm mất quyền cũ → cấp lại đúng hiện trạng trước migration:
-- authenticated + service_role (postgres là owner). Không cấp cho anon/PUBLIC.
REVOKE ALL ON FUNCTION public.create_group_booking_txn(json, json, json, json, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_booking_txn(json, json, json, json, jsonb) TO authenticated, service_role;

COMMIT;
