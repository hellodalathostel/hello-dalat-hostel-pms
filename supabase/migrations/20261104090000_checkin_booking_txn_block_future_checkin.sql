-- Rule 2 (chốt 29/10/2026): chỉ cho check-in khi hôm nay (Asia/Ho_Chi_Minh) >= ngày check-in dự kiến.
-- Giữ nguyên chữ ký, SECURITY DEFINER, search_path và toàn bộ logic của bản đang chạy
-- (20260820232755_fix_checkin_booking_txn_guests_count_accumulate + search_path 'public','pg_temp' trên prod);
-- chỉ thêm 1 kiểm tra ngày sau bước validate trạng thái.
-- Không breaking: booking đến hạn/quá hạn vẫn check-in như cũ. Revert = chạy lại định nghĩa cũ.

CREATE OR REPLACE FUNCTION public.checkin_booking_txn(p_booking_id uuid, p_guests json)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_booking      bookings%ROWTYPE;
  v_guest        JSON;
  v_customer_id  UUID;
  v_customer_ids UUID[];
  v_idx          INTEGER;
  v_total_guests INTEGER;
BEGIN
  -- Validate booking tồn tại và trạng thái hợp lệ
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id USING ERRCODE = 'P0001';
  END IF;
  IF v_booking.status NOT IN ('booked', 'checked-in') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Booking đang ở trạng thái %, không thể check-in', v_booking.status
      USING ERRCODE = 'P0002';
  END IF;

  -- Rule 2: chặn check-in trước ngày dự kiến (ngày theo giờ Việt Nam)
  IF (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < v_booking.check_in THEN
    RAISE EXCEPTION 'CHECKIN_TOO_EARLY: Chưa đến ngày check-in (dự kiến %). Sửa ngày check-in trước nếu khách đến sớm.',
      to_char(v_booking.check_in, 'DD/MM/YYYY')
      USING ERRCODE = 'P0008';
  END IF;

  -- Upsert từng khách — ON CONFLICT theo composite (document_type, document_number)
  v_customer_ids := ARRAY[]::UUID[];
  FOR v_idx IN 0 .. (JSON_ARRAY_LENGTH(p_guests) - 1) LOOP
    v_guest := p_guests->v_idx;

    INSERT INTO customers (
      full_name, document_type, document_number,
      nationality, date_of_birth, gender,
      residency_type, province, district, ward, address_detail
    )
    VALUES (
      v_guest->>'full_name',
      (v_guest->>'document_type')::document_type,
      v_guest->>'document_number',
      v_guest->>'nationality',
      NULLIF(v_guest->>'date_of_birth', '')::DATE,
      v_guest->>'gender',
      (NULLIF(v_guest->>'residency_type', ''))::residency_type,
      v_guest->>'province',
      v_guest->>'district',
      v_guest->>'ward',
      v_guest->>'address_detail'
    )
    ON CONFLICT ON CONSTRAINT uq_customers_doc
    DO UPDATE SET
      full_name     = EXCLUDED.full_name,
      nationality   = EXCLUDED.nationality,
      date_of_birth = EXCLUDED.date_of_birth,
      gender        = EXCLUDED.gender,
      updated_at    = NOW()
    RETURNING id INTO v_customer_id;

    v_customer_ids := v_customer_ids || v_customer_id;
  END LOOP;

  -- Upsert booking_guests
  FOR v_idx IN 1 .. ARRAY_LENGTH(v_customer_ids, 1) LOOP
    INSERT INTO booking_guests (booking_id, customer_id, is_primary)
    VALUES (p_booking_id, v_customer_ids[v_idx], v_idx = 1)
    ON CONFLICT (booking_id, customer_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;
  END LOOP;

  -- guests_count = tổng số khách DUY NHẤT thực sự đang gắn với booking này
  -- (đếm từ booking_guests, không phải từ JSON_ARRAY_LENGTH(p_guests) của lần gọi hiện tại)
  -- => cộng dồn đúng khi check-in nhiều đợt (import Excel nhiều lần, khách đến lệch giờ)
  SELECT COUNT(*) INTO v_total_guests
  FROM booking_guests
  WHERE booking_id = p_booking_id;

  -- Update booking status + actual_check_in + guests_count
  -- actual_check_in: giữ nguyên giá trị lần check-in đầu tiên nếu đã có
  UPDATE bookings SET
    status          = 'checked-in',
    actual_check_in = COALESCE(v_booking.actual_check_in, NOW()),
    guests_count    = v_total_guests,
    updated_at      = NOW()
  WHERE id = p_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success',      TRUE,
    'booking_id',   p_booking_id,
    'guests_count', v_total_guests
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

-- Giữ quyền như hiện tại trên prod: chỉ authenticated + service_role, không PUBLIC/anon.
REVOKE ALL ON FUNCTION public.checkin_booking_txn(uuid, json) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.checkin_booking_txn(uuid, json) FROM anon;
GRANT EXECUTE ON FUNCTION public.checkin_booking_txn(uuid, json) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_booking_txn(uuid, json) TO service_role;
