-- MANUAL DATA-FIX RECORD: gap_5_group_lech_paid_ngoai_backlog
-- ALREADY EXECUTED ON PRODUCTION ON 2026-07-31.
-- DO NOT move this file into supabase/migrations or run it automatically.
-- It is retained for audit/recovery context; the fail-closed guard in group 4
-- intentionally rejects a second execution after the state has already changed.
--
-- BOI CANH: 5 group da checked-out tu truoc (phat hien 2026-07-18 khi lam
-- migration 02b, ngoai scope luc do) co paid < grand_total, lech nho 300d -
-- 342.310d moi group, tong ~1.5tr. Doc lap voi backlog data-fix Jan-May 2026
-- (255 group da xu ly rieng). Hieu xac nhan tung truong hop 2026-07-31 qua
-- doi thoai voi Claude (claude.ai Lead Developer session).
--
-- KET LUAN SAU KHI DOI CHIEU payment_history: ca 5 group deu KHONG thieu
-- payment record trong he thong (payment_history khop dung groups.paid truoc
-- fix) -> day la TIEN THAT DA THU MAT NGOAI DOI (cash) chua duoc ghi vao he
-- thong, HOAC discount chinh sach (no-show) chua duoc ap dung -- KHONG phai
-- loi ghi nhan/loi trigger, KHONG phai gia phong nhap sai nhu gia thuyet ban
-- dau (moi group deu duoc kiem tra rieng room_subtotal/services truoc khi ket
-- luan).
--
-- ================================================================
-- GROUP 1/5: Axelle Kennes (cceb770c-98bf-4aa3-8364-8d0703a7e6a1)
-- ================================================================
-- Lech 300d (grand_total 1.293.300 / paid 1.293.000). Booking.com, 2 dem x
-- 2 phong, khong khop bat ky pattern services/discount nao. Hieu xac nhan:
-- BO QUA, khong xu ly -- lech lam tron khong dang ke.
-- KHONG CO STATEMENT NAO CHAY CHO GROUP NAY.

-- ================================================================
-- GROUP 2/5: Trúc (472a1fe5-777a-496d-8069-7641bd92c951)
-- ================================================================
-- Lech 200.000d (grand_total 400.000 / paid 200.000). 2 booking, phong 102
-- (18/06->19/06) va phong 302 (19/06->20/06), moi booking 200.000d.
-- Hieu xac nhan: day la NO-SHOW CHARGE -- khach khong den (dem thu 2, phong
-- 302), khong thu them, huy no con lai bang discount.
--
-- GUARD da chay (trong BEGIN...ROLLBACK) truoc khi apply that:
--   - groups.grand_total = 400000 AND groups.paid = 200000 (dung state truoc fix)
--   - bookings.grand_total (booking 30e4a93b) = 200000 (dung state truoc fix)
-- Insert truc tiep vao booking_discounts (KHONG qua add_discount_txn) vi RPC
-- do chan status='checked-out' (BOOKING_INVALID_STATUS) -- day la data-fix
-- lich su hop le, khong phai sua hoa don dang hoat dong.
--
-- DA THUC HIEN (2026-07-31):
INSERT INTO booking_discounts (booking_id, amount, description)
VALUES (
  '30e4a93b-bc6f-49ed-b053-006b59b0e3bd',
  200000,
  'No-show charge - Hiếu xác nhận không thu thêm (data-fix gap_5_group 2026-07-31)'
);
-- KET QUA VERIFY: booking grand_total 200000->0, group grand_total 400000->200000,
-- group paid=200000, balance 200000->0.

-- ================================================================
-- GROUP 3/5: omg zek (9184f7f6-c0e6-41a1-af87-940a6e1834a5)
-- ================================================================
-- Lech 342.310d (grand_total 584.500 / paid 242.190). 1 booking phong 202
-- (10/07->12/07, 2 dem), grand_total = room 522.000 + giat say 62.500.
-- Hieu xac nhan: DA THU DU BANG TIEN MAT, chi la chua ghi vao he thong.
--
-- DA THUC HIEN (2026-07-31), qua RPC record_payment_txn (khong bypass, vi
-- group van o trang thai cho phep ghi payment binh thuong):
SELECT record_payment_txn(
  '9184f7f6-c0e6-41a1-af87-940a6e1834a5',
  342310,
  'cash',
  'Data-fix gap_5_group: tiền mặt đã thu đủ, ghi bổ sung 2026-07-31',
  '8d6a879b-b7a4-4de5-bb3c-e57c75c05656'
);
-- KET QUA VERIFY: group paid 242190->584500, balance 342310->0.

-- ================================================================
-- GROUP 4/5: Hang Huynh / Trần Anh Tú (7ec3f5a1-5a54-415f-8b2e-36c9ae5eae44)
-- ================================================================
-- Lech 300.000d (grand_total 954.140 / paid 654.140). Group nay chua 2 khach
-- KHAC NHAU gop chung: booking 194ca7b5 (phong 102, Hang Huynh, Booking.com,
-- 03/07->05/07, da tra qua Booking.com) va booking 843724ea (phong 203, Trần
-- Anh Tú, walk-in, 04/07->05/07, gia 300.000d) -- CA HAI co actual_check_in/
-- actual_check_out rieng, KHONG phai booking trung lap/rac.
-- Hieu xac nhan: khach Tu DA TRA TIEN MAT nhung chua ghi.
--
-- DA THUC HIEN (2026-07-31), qua RPC record_payment_txn:
SELECT record_payment_txn(
  '7ec3f5a1-5a54-415f-8b2e-36c9ae5eae44',
  300000,
  'cash',
  'Data-fix gap_5_group: khách Trần Anh Tú (phòng 203) đã trả tiền mặt, ghi bổ sung 2026-07-31',
  '843724ea-ed48-40a3-b37b-c03a6e88300f'
);
-- KET QUA VERIFY: group paid 654140->954140, balance 300000->0.
--
-- LUU Y RIENG: group nay tron 2 khach khac nguon (1 Booking.com + 1 walk-in)
-- vao chung 1 group "Hang Huynh" -- co the la thao tac gop nham luc tao
-- booking. Khong sua cau truc group (ngoai scope data-fix nay), chi ghi nhan
-- de tham khao neu gap pattern tuong tu sau nay.

-- ================================================================
-- GROUP 5/5: Mireia Zamora Coronel (7acf77fd-24b4-4a64-a9df-bc3bc274dc8e)
-- ================================================================
-- Lech 187.500d (grand_total 974.144 / paid 786.644). 2 booking phong 201+203
-- (07/07->08/07), gia phong 393.322d/phong DUNG (Booking.com net rate, khop
-- 2x393.322=786.644=paid truoc fix). Lech = DUNG BANG phi Giat sấy (kg) x7.50
-- = 187.500d tren booking 53085855.
-- Hieu xac nhan: khach DA TRA TIEN MAT phi giat say nhung chua ghi.
--
-- DA THUC HIEN (2026-07-31), qua RPC record_payment_txn:
SELECT record_payment_txn(
  '7acf77fd-24b4-4a64-a9df-bc3bc274dc8e',
  187500,
  'cash',
  'Data-fix gap_5_group: phí giặt sấy đã thu tiền mặt, ghi bổ sung 2026-07-31',
  '53085855-846e-4878-8d86-28a9e7bdc5c1'
);
-- KET QUA VERIFY: group paid 786644->974144, balance 187500->0.

-- ================================================================
-- STATE SAU KHI FIX (verify 2026-07-31, tat ca da confirm qua SELECT truc tiep):
--   cceb770c (Axelle Kennes):   grand_total 1293300, paid 1293000, balance 300  (KHONG XU LY, chap nhan)
--   472a1fe5 (Trúc):            grand_total 200000,  paid 200000,  balance 0
--   9184f7f6 (omg zek):         grand_total 584500,  paid 584500,  balance 0
--   7ec3f5a1 (Hang Huynh):      grand_total 954140,  paid 954140,  balance 0
--   7acf77fd (Mireia Zamora):   grand_total 974144,  paid 974144,  balance 0
-- ================================================================
