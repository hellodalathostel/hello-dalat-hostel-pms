-- 20 booking Booking.com T1/2026: price_per_night đang chứa tổng tiền cả kỳ ở (= grand_total). Chia lại theo số đêm.
DO $$
DECLARE v_n int;
BEGIN
  UPDATE public.bookings
     SET price_per_night = round(grand_total::numeric / nights)::int
   WHERE is_deleted = false AND status <> 'cancelled'
     AND check_out >= '2026-01-01' AND check_out < '2026-02-01'
     AND room_subtotal <> grand_total AND price_per_night = grand_total AND nights > 1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 20 THEN
    RAISE EXCEPTION 'Mong đợi 20 dòng, thực tế %', v_n;
  END IF;
END $$;
