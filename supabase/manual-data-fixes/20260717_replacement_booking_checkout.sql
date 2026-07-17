-- MANUAL DATA-FIX RECORD: booking 3d6a92d6 (group 48f21f9b)
-- ALREADY EXECUTED ON PRODUCTION ON 2026-07-17.
-- DO NOT move this file into supabase/migrations or run it automatically.
-- It is retained for audit/recovery context; the fail-closed guards intentionally
-- reject a second execution after the booking has reached the corrected state.
--
-- BOI CANH: booking 3d6a92d6 la ban "tao lai" cua booking cu 7c28c651 (cung
-- phong 103, cung check_in/check_out 2026-06-27 -> 2026-06-29, cung group
-- 48f21f9b). Booking cu 7c28c651 bi huy (cancelled) va co actual_check_out
-- that = 2026-06-29 16:17:02.370364+07. Booking moi 3d6a92d6 van o status
-- 'booked', actual_check_out = NULL - trong khi group 48f21f9b da bi
-- checkout_group_txn (cu, co bug) set status='checked-out' VO DIEU KIEN.
--
-- RUI RO DA DUOC HIEU CHI RA: neu dung actual_check_out = NOW() (17/07) thay
-- vi timestamp that (29/06), sau khi Migration 02b (S1a dung actual_check_out)
-- apply, se chuyen nham 522.450 dong doanh thu tu thang 6 sang thang 7 trong
-- so lieu thue. Migration nay PHAI dung dung timestamp cua predecessor - LAY
-- TRUC TIEP TU DB, khong hard-code timestamp vao migration.
--
-- STATE TRUOC KHI FIX (ghi lai de doi chieu sau, khong phai gia tri ky vong
-- cung): groups.grand_total = 2274950, groups.paid = 2274950,
-- groups.updated_at = 2026-07-03 10:01:09.691494+07 (verify qua SELECT truc
-- tiep ngay truoc khi viet migration nay).
--
-- FIX: cap nhat 3d6a92d6 thanh checked-out voi actual_check_out lay TU
-- predecessor 7c28c651 (KHONG dung NOW(), KHONG hard-code timestamp).
--
-- GUARD (fail-closed, RAISE EXCEPTION + khong ghi gi neu bat ky dieu kien nao sai):
--   1. Ca 2 booking ton tai.
--   2. Ca 2 cung group_id = 48f21f9b-6479-4a91-bd2d-eafdb835862e (gia tri
--      ky vong, khong doc dong tu 1 trong 2 booking de tranh tu xac nhan sai).
--   3. Cung group_id giua 2 booking.
--   4. Cung room_id.
--   5. Cung check_in, check_out.
--   6. Booking moi (3d6a92d6) dang o status 'booked' (chua bi thao tac
--      khac dong lai truoc do).
--   7. Predecessor (7c28c651) co actual_check_out IS NOT NULL.
--   8. UPDATE phai anh huong DUNG 1 ROW - dung GET DIAGNOSTICS, 0 hoac >1
--      deu RAISE EXCEPTION va ROLLBACK (khong chi la assert logic, ma la
--      kiem tra thuc te so dong bi UPDATE).
--
-- SAU KHI FIX: kiem tra groups.grand_total va groups.paid cua group
-- 48f21f9b KHONG doi so voi truoc (trigger sync_group_net_revenue co the
-- chay lai khi bookings.status doi, can xac nhan khong lam lech financials
-- da chot cua group).

DO $$
DECLARE
  v_new_id uuid := '3d6a92d6-dd95-410c-9fdb-78cb92d5ad43';
  v_old_id uuid := '7c28c651-2e3e-44c3-ba65-a3825c52fb17';
  v_expected_group_id uuid := '48f21f9b-6479-4a91-bd2d-eafdb835862e';
  v_new_status public.booking_status;
  v_new_group_id uuid;
  v_new_room_id text;
  v_new_check_in date;
  v_new_check_out date;
  v_old_status public.booking_status;
  v_old_group_id uuid;
  v_old_room_id text;
  v_old_check_in date;
  v_old_check_out date;
  v_old_actual_check_out timestamptz;
  v_group_grand_total_before integer;
  v_group_paid_before integer;
  v_group_grand_total_after integer;
  v_group_paid_after integer;
  v_rows_affected integer;
BEGIN
  -- === Doc state truoc khi sua (de doi chieu sau, KHONG phai de xac nhan guard) ===
  SELECT grand_total, paid INTO v_group_grand_total_before, v_group_paid_before
  FROM public.groups WHERE id = v_expected_group_id
  FOR UPDATE;

  SELECT status, group_id, room_id, check_in, check_out
  INTO v_new_status, v_new_group_id, v_new_room_id, v_new_check_in, v_new_check_out
  FROM public.bookings WHERE id = v_new_id
  FOR UPDATE;

  SELECT status, group_id, room_id, check_in, check_out, actual_check_out
  INTO v_old_status, v_old_group_id, v_old_room_id, v_old_check_in, v_old_check_out, v_old_actual_check_out
  FROM public.bookings WHERE id = v_old_id
  FOR UPDATE;

  -- === GUARD 1: ton tai ===
  IF v_new_group_id IS NULL OR v_old_group_id IS NULL THEN
    RAISE EXCEPTION 'GUARD FAIL: khong tim thay 1 trong 2 booking (new=% old=%)', v_new_id, v_old_id;
  END IF;

  -- === GUARD 2: group_id dung gia tri ky vong (khong tu suy tu 1 trong 2 booking) ===
  IF v_new_group_id <> v_expected_group_id OR v_old_group_id <> v_expected_group_id THEN
    RAISE EXCEPTION 'GUARD FAIL: group_id khong khop expected % (new_group=% old_group=%)',
      v_expected_group_id, v_new_group_id, v_old_group_id;
  END IF;

  -- === GUARD 3: cung group_id giua 2 booking ===
  IF v_new_group_id <> v_old_group_id THEN
    RAISE EXCEPTION 'GUARD FAIL: 2 booking khac group_id (new=% old=%)', v_new_group_id, v_old_group_id;
  END IF;

  -- === GUARD 4: cung room_id ===
  IF v_new_room_id <> v_old_room_id THEN
    RAISE EXCEPTION 'GUARD FAIL: 2 booking khac room_id (new=% old=%)', v_new_room_id, v_old_room_id;
  END IF;

  -- === GUARD 5: cung check_in/check_out ===
  IF v_new_check_in <> v_old_check_in OR v_new_check_out <> v_old_check_out THEN
    RAISE EXCEPTION 'GUARD FAIL: 2 booking khac ngay check_in/check_out (new %..% old %..%)',
      v_new_check_in, v_new_check_out, v_old_check_in, v_old_check_out;
  END IF;

  -- === GUARD 6: booking moi van la 'booked' ===
  IF v_new_status <> 'booked' THEN
    RAISE EXCEPTION 'GUARD FAIL: booking moi % khong con status booked (hien tai: %) - da bi sua boi thao tac khac, KHONG chay migration nay nua', v_new_id, v_new_status;
  END IF;

  -- === GUARD 7: predecessor co actual_check_out that ===
  IF v_old_actual_check_out IS NULL THEN
    RAISE EXCEPTION 'GUARD FAIL: predecessor % khong co actual_check_out - khong the lay timestamp that', v_old_id;
  END IF;

  -- === Tat ca guard 1-7 pass -> ghi fix, dung actual_check_out CUA PREDECESSOR (tu bien, khong hard-code) ===
  UPDATE public.bookings
  SET status = 'checked-out',
      actual_check_out = v_old_actual_check_out,
      updated_at = now()
  WHERE id = v_new_id;

  -- === GUARD 8: UPDATE phai anh huong DUNG 1 ROW ===
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected <> 1 THEN
    RAISE EXCEPTION 'GUARD FAIL: UPDATE anh huong % dong (ky vong dung 1) - ROLLBACK toan bo', v_rows_affected;
  END IF;

  -- === Kiem tra financials cua group KHONG bi lech ngoai du kien sau khi doi status booking ===
  SELECT grand_total, paid INTO v_group_grand_total_after, v_group_paid_after
  FROM public.groups WHERE id = v_expected_group_id;

  IF v_group_grand_total_after <> v_group_grand_total_before OR v_group_paid_after <> v_group_paid_before THEN
    RAISE EXCEPTION 'GUARD FAIL: groups.grand_total/paid cua group % bi doi ngoai du kien sau update (truoc: grand_total=% paid=% | sau: grand_total=% paid=%) - can Hieu xem xet truoc khi apply that, co the trigger sync_group_net_revenue phan ung khong nhu mong doi',
      v_expected_group_id, v_group_grand_total_before, v_group_paid_before, v_group_grand_total_after, v_group_paid_after;
  END IF;

  RAISE NOTICE 'DATA-FIX OK: booking % -> checked-out, actual_check_out = %, group financials khong doi (grand_total=%, paid=%)',
    v_new_id, v_old_actual_check_out, v_group_grand_total_after, v_group_paid_after;
END $$;

-- VERIFY sau khi apply:
-- SELECT id, status, actual_check_out FROM public.bookings
-- WHERE id IN ('3d6a92d6-dd95-410c-9fdb-78cb92d5ad43','7c28c651-2e3e-44c3-ba65-a3825c52fb17');
-- Ky vong: 3d6a92d6.status='checked-out', actual_check_out = 2026-06-29 16:17:02.370364+07
-- (khop chinh xac voi 7c28c651.actual_check_out, LAY TU DB chu khong phai hard-code)
--
-- SELECT id, grand_total, paid, updated_at FROM public.groups
-- WHERE id = '48f21f9b-6479-4a91-bd2d-eafdb835862e';
-- Ky vong: grand_total=2274950, paid=2274950 (KHONG doi so voi truoc khi fix)

-- RECORDED RESULT (production, 2026-07-17):
--   booking 3d6a92d6-dd95-410c-9fdb-78cb92d5ad43
--     status = checked-out
--     actual_check_out = 2026-06-29 16:17:02.370364+07
--   group 48f21f9b-6479-4a91-bd2d-eafdb835862e
--     grand_total = 2274950
--     paid = 2274950
-- Group financial totals were unchanged by the correction.
