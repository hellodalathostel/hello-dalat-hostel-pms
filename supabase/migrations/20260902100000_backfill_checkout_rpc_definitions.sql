-- Backfill migration: ghi lại definition ĐÃ TỒN TẠI THẬT trên DB (project rcfhhgywjdwqcgnpkbtl)
-- vào version control. checkout_last_booking_and_settle_txn và checkout_single_booking_txn
-- được tạo trực tiếp trên DB ngày 15/07/2026 (sửa lock order 17/07/2026), cả hai lần đều
-- KHÔNG qua migration — audit 02/09/2026 xác nhận không có CREATE FUNCTION nào của 2 hàm
-- này trong bất kỳ file migration nào, kể cả _archive/_archived.
--
-- Nội dung dưới đây là pg_get_functiondef() dump nguyên trạng từ DB ngày 02/09/2026,
-- KHÔNG sửa thân hàm. CREATE OR REPLACE nên chạy lại vô hại (idempotent) trên DB
-- đã có sẵn 2 hàm này với definition giống hệt.
--
-- audit-followup-20260902, Việc 3. KHÔNG apply migration này cho tới khi Hiếu và
-- Claude.ai (Lead Dev) duyệt.

CREATE OR REPLACE FUNCTION public.checkout_last_booking_and_settle_txn(p_booking_id uuid, p_expected_group_grand_total integer, p_expected_group_paid integer, p_payment_method public.payment_method DEFAULT NULL::public.payment_method, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_booking_status public.booking_status;
  v_group_grand_total integer;
  v_group_paid integer;
  v_remaining integer;
  v_other_active_count integer;
  v_surcharge_amount integer := 0;
  v_card_fee_applied boolean := false;
  v_payment_result json;
BEGIN
  IF p_expected_group_grand_total IS NULL OR p_expected_group_paid IS NULL THEN
    RAISE EXCEPTION 'MISSING_EXPECTED_STATE: bắt buộc truyền p_expected_group_grand_total và p_expected_group_paid.'
      USING ERRCODE = 'P0037';
  END IF;

  -- LOCK BOOKING TRƯỚC (booking -> group, khớp toàn hệ thống)
  SELECT b.group_id, b.status
    INTO v_group_id, v_booking_status
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.is_deleted = FALSE
  FOR UPDATE OF b;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Booking % không tồn tại hoặc đã bị xoá', p_booking_id USING ERRCODE = 'P0030';
  END IF;

  -- LOCK GROUP SAU + lấy totals từ row đã lock
  SELECT g.grand_total, g.paid
    INTO v_group_grand_total, v_group_paid
  FROM public.groups g
  WHERE g.id = v_group_id
  FOR UPDATE OF g;

  IF v_booking_status <> 'checked-in' THEN
    RAISE EXCEPTION 'Booking % không ở trạng thái checked-in (hiện: %), không thể checkout', p_booking_id, v_booking_status
      USING ERRCODE = 'P0031';
  END IF;

  SELECT count(*) INTO v_other_active_count
  FROM public.bookings b
  WHERE b.group_id = v_group_id
    AND b.id <> p_booking_id
    AND b.is_deleted = FALSE
    AND b.status IN ('booked', 'checked-in');

  IF v_other_active_count > 0 THEN
    RAISE EXCEPTION 'Group % còn % booking active khác. Dùng checkout_single_booking_txn cho booking %.', v_group_id, v_other_active_count, p_booking_id
      USING ERRCODE = 'P0033';
  END IF;

  IF p_expected_group_grand_total <> COALESCE(v_group_grand_total, 0) THEN
    RAISE EXCEPTION 'STALE_GROUP_BALANCE: grand_total đã đổi (staff thấy %, hiện %). Vui lòng refresh.', p_expected_group_grand_total, v_group_grand_total
      USING ERRCODE = 'P0035';
  END IF;

  IF p_expected_group_paid <> COALESCE(v_group_paid, 0) THEN
    RAISE EXCEPTION 'STALE_GROUP_BALANCE: paid đã đổi (staff thấy %, hiện %). Vui lòng refresh.', p_expected_group_paid, v_group_paid
      USING ERRCODE = 'P0035';
  END IF;

  v_remaining := COALESCE(v_group_grand_total, 0) - COALESCE(v_group_paid, 0);

  -- record_payment_txn (harden v5): nếu method='card' cần lock lại booking (đã bị lock ở đây,
  -- cùng transaction nên không tự-deadlock — Postgres cho phép transaction lock lại row nó
  -- đã giữ). Truyền v_remaining gốc, record_payment_txn tự tính surcharge, tránh double-count.
  IF v_remaining > 0 THEN
    IF p_payment_method IS NULL THEN
      RAISE EXCEPTION 'Group % còn nợ % nhưng chưa chọn phương thức thanh toán', v_group_id, v_remaining
        USING ERRCODE = 'P0034';
    END IF;

    SELECT public.record_payment_txn(
      v_group_id, v_remaining, p_payment_method,
      COALESCE(p_note, 'Thu tại checkout (booking cuối)'), p_booking_id
    ) INTO v_payment_result;

    v_surcharge_amount := COALESCE((v_payment_result->>'surcharge_amount')::integer, 0);
    v_card_fee_applied := COALESCE((v_payment_result->>'card_fee_applied')::boolean, false);
  END IF;

  UPDATE public.bookings
  SET status = 'checked-out', actual_check_out = now(), updated_at = now()
  WHERE id = p_booking_id;

  UPDATE public.groups
  SET status = 'checked-out', updated_at = now()
  WHERE id = v_group_id;

  RETURN json_build_object(
    'ok', true, 'booking_id', p_booking_id, 'group_id', v_group_id, 'group_closed', true,
    'remaining_before_payment', v_remaining, 'surcharge_amount', v_surcharge_amount, 'card_fee_applied', v_card_fee_applied
  );
END;
$function$;

ALTER FUNCTION public.checkout_last_booking_and_settle_txn(uuid, integer, integer, public.payment_method, text) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.checkout_last_booking_and_settle_txn(uuid, integer, integer, public.payment_method, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.checkout_last_booking_and_settle_txn(uuid, integer, integer, public.payment_method, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.checkout_single_booking_txn(p_booking_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_booking_status public.booking_status;
  v_remaining_active_count integer;
BEGIN
  -- LOCK BOOKING TRƯỚC (khớp thứ tự tự nhiên của toàn hệ thống: update_booking_txn,
  -- checkin_booking_txn... đều update bookings trực tiếp rồi trigger mới đụng groups).
  -- group_id đọc từ ĐÂY là chính xác tại thời điểm lock, không cần ràng buộc ngược.
  SELECT b.group_id, b.status
    INTO v_group_id, v_booking_status
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.is_deleted = FALSE
  FOR UPDATE OF b;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Booking % không tồn tại hoặc đã bị xoá', p_booking_id USING ERRCODE = 'P0030';
  END IF;

  -- LOCK GROUP SAU (booking -> group, khớp toàn hệ thống).
  PERFORM 1 FROM public.groups g WHERE g.id = v_group_id FOR UPDATE OF g;

  IF v_booking_status <> 'checked-in' THEN
    RAISE EXCEPTION 'Booking % không ở trạng thái checked-in (hiện: %), không thể checkout', p_booking_id, v_booking_status
      USING ERRCODE = 'P0031';
  END IF;

  SELECT count(*) INTO v_remaining_active_count
  FROM public.bookings b
  WHERE b.group_id = v_group_id
    AND b.id <> p_booking_id
    AND b.is_deleted = FALSE
    AND b.status IN ('booked', 'checked-in');

  IF v_remaining_active_count = 0 THEN
    RAISE EXCEPTION 'Booking % là booking active cuối cùng trong group %. Dùng checkout_last_booking_and_settle_txn.', p_booking_id, v_group_id
      USING ERRCODE = 'P0032';
  END IF;

  UPDATE public.bookings
  SET status = 'checked-out', actual_check_out = now(), updated_at = now()
  WHERE id = p_booking_id;

  RETURN json_build_object('ok', true, 'booking_id', p_booking_id, 'group_id', v_group_id, 'group_closed', false);
END;
$function$;

ALTER FUNCTION public.checkout_single_booking_txn(uuid) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.checkout_single_booking_txn(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.checkout_single_booking_txn(uuid) TO authenticated, service_role;
