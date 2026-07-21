-- supabase/migrations/20260618000003_create_confirm_booking_request_txn.sql
-- Mục đích: Codex review High finding #3 — convertMutation trong useBookingRequests.ts
-- gọi create_group_booking_txn rồi update booking_requests.status riêng (2 lệnh tách rời).
-- Nếu update fail sau khi booking đã tạo, request vẫn 'pending' → có thể bị confirm lại,
-- tạo booking trùng. Gộp toàn bộ vào 1 RPC transactional.

CREATE OR REPLACE FUNCTION public.confirm_booking_request_txn(
  p_request_id uuid,
  p_price_per_night integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request     RECORD;
  v_group_id    UUID;
  v_booking_id  UUID;
  v_avail       RECORD;
BEGIN
  -- Lock row request để chặn 2 lần confirm đồng thời (race condition)
  SELECT id, name, phone, note, room_id, check_in, check_out, status
    INTO v_request
    FROM booking_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: %', p_request_id USING ERRCODE = 'P0001';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'REQUEST_ALREADY_PROCESSED: request % đã ở trạng thái %, không thể confirm lại',
      p_request_id, v_request.status USING ERRCODE = 'P0002';
  END IF;

  IF p_price_per_night IS NULL OR p_price_per_night <= 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE: price_per_night phải > 0' USING ERRCODE = 'P0003';
  END IF;

  -- Check availability ngay trong transaction (tránh TOCTOU giữa check ở frontend và insert)
  SELECT * INTO v_avail
    FROM check_room_availability(v_request.room_id, v_request.check_in, v_request.check_out, NULL);

  IF NOT v_avail.available THEN
    RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % bị xung đột (% — % đến %)',
      v_request.room_id, v_avail.conflict_type,
      v_avail.conflict_check_in, v_avail.conflict_check_out
      USING ERRCODE = 'P0004';
  END IF;

  -- Tạo group
  INSERT INTO groups (customer_name, customer_phone, customer_note, customer_cccd, source, channel_fee_rate)
  VALUES (
    v_request.name,
    v_request.phone,
    'Convert từ booking request ' || v_request.id,
    '',
    'Walk-in',
    0
  )
  RETURNING id INTO v_group_id;

  -- Tạo booking
  INSERT INTO bookings (group_id, room_id, check_in, check_out, price_per_night, guests_count, guest_name, note)
  VALUES (
    v_group_id,
    v_request.room_id,
    v_request.check_in,
    v_request.check_out,
    p_price_per_night,
    1,
    v_request.name,
    COALESCE(v_request.note, '')
  )
  RETURNING id INTO v_booking_id;

  -- Cập nhật request — cùng transaction, không thể tách rời
  UPDATE booking_requests
     SET status = 'confirmed',
         converted_group_id = v_group_id,
         updated_at = NOW()
   WHERE id = p_request_id;

  RETURN JSON_BUILD_OBJECT(
    'success',    TRUE,
    'group_id',   v_group_id,
    'booking_id', v_booking_id
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_booking_request_txn(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_booking_request_txn(uuid, integer) TO authenticated, service_role;
