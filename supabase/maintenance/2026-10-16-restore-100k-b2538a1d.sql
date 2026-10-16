-- =====================================================================
-- Khôi phục khoản chuyển khoản 100.000 ngày 17/05/2026 của group b2538a1d
-- Project: rcfhhgywjdwqcgnpkbtl
--
-- KHÔNG PHẢI MIGRATION. Script chạy MỘT LẦN — đã chạy 16/10/2026 13:32 (+07), Hiếu đã duyệt.
-- Không chứa tên khách — chỉ mã group rút gọn.
--
-- Bối cảnh (xem 2026-10-16-paid-consistency-audit.sql):
--   groups.paid = grand_total = 2.157.848, nhưng payment_history chỉ còn 2.057.848 (thẻ 03/06).
--   Bằng chứng khoản thiếu là CK 100.000 ngày 17/05:
--     - brain.daily_log revenue_summary 17/05 (ghi 18/05 01:00): transfer 100.000
--     - thanh toán thẻ 03/06 = grand_total − 100.000
--   Dòng payment bị DELETE trực tiếp (không qua void_payment_txn). Ai/khi nào: [Không xác nhận được].
--
-- Vì sao INSERT trực tiếp, không dùng record_payment_txn:
--   - record_payment_txn cộng thêm vào groups.paid (paid đã đúng) và báo OVERPAYMENT (còn lại = 0).
--   - Trigger duy nhất trên payment_history (trg_payment_sync_net_revenue → sync_group_net_revenue)
--     chỉ tính lại grand_total / net_revenue từ bookings + updated_at, KHÔNG đụng groups.paid.
--   - payment_history không có cột booking_id.
--
-- Kết quả 16/10/2026:
--   trước: paid 2.157.848 | gt 2.157.848 | net 1.834.171 | payment hợp lệ 2.057.848 | CK T05 1.781.590
--   sau:   paid 2.157.848 | gt 2.157.848 | net 1.834.171 | payment hợp lệ 2.157.848 | CK T05 1.881.590
--   Không đổi: sổ quỹ tiền mặt T05/T06/T07 (2.115.960 / 30.886.485 / 170.796.026), sổ quỹ 16/10
--   (thu 542.615), S1a 2026 317.319.554, get_tax_threshold_summary(2026) 317.319.554 / 380.783.465,
--   finance_monthly_revenue 303.423.307, monthly_revenue 338.614.070.
--   Thay đổi ngoài dự kiến duy nhất: groups.updated_at (do trigger).
--   Dòng mới: payment_history d6b7b220-…
-- =====================================================================

BEGIN;

INSERT INTO payment_history (group_id, amount, method, date, is_void, note)
VALUES ('b2538a1d-1316-49e5-aa90-cc1861bff915', 100000, 'transfer', '2026-05-17', false,
  'Bu khoan bi xoa khoi payment_history - doi chieu 2026-10-16 (bang chung: daily_log 17/05 CK 100.000, groups.paid, grand_total tru the 03/06)');

-- Lệch bất kỳ điều kiện nào → RAISE EXCEPTION → toàn bộ transaction rollback.
DO $$
DECLARE
  g record;
  v_valid bigint;
  v_tr05 bigint;
  v_cash05 bigint;
BEGIN
  SELECT paid, grand_total, net_revenue INTO g FROM groups WHERE id = 'b2538a1d-1316-49e5-aa90-cc1861bff915';
  IF g.paid <> 2157848 OR g.grand_total <> 2157848 OR g.net_revenue <> 1834171 THEN
    RAISE EXCEPTION 'VERIFY_FAIL group: paid=% gt=% net=%', g.paid, g.grand_total, g.net_revenue;
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_valid FROM payment_history
   WHERE group_id = 'b2538a1d-1316-49e5-aa90-cc1861bff915' AND NOT is_void;
  IF v_valid <> g.paid THEN
    RAISE EXCEPTION 'VERIFY_FAIL valid_sum=% paid=%', v_valid, g.paid;
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_tr05 FROM payment_history
   WHERE NOT is_void AND method = 'transfer' AND date BETWEEN '2026-05-01' AND '2026-05-31';
  IF v_tr05 <> 1881590 THEN
    RAISE EXCEPTION 'VERIFY_FAIL transfer_T05=%', v_tr05;
  END IF;

  SELECT coalesce(sum(amount) FILTER (WHERE direction = 'in'), 0) INTO v_cash05 FROM cash_book_detail
   WHERE entry_date BETWEEN '2026-05-01' AND '2026-05-31';
  IF v_cash05 <> 2115960 THEN
    RAISE EXCEPTION 'VERIFY_FAIL cash_T05=%', v_cash05;
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- Verify (CHỈ SELECT — chạy lại được bất kỳ lúc nào)
-- =====================================================================
select json_build_object(
  'grp', (select json_build_object('paid', paid, 'gt', grand_total, 'net', net_revenue, 'updated_at', updated_at)
          from groups where id = 'b2538a1d-1316-49e5-aa90-cc1861bff915'),
  'valid_sum', (select sum(amount) from payment_history
                where group_id = 'b2538a1d-1316-49e5-aa90-cc1861bff915' and not is_void),
  'transfer_t05', (select sum(amount) from payment_history
                   where not is_void and method = 'transfer' and date between '2026-05-01' and '2026-05-31'),
  'pay_0517', (select json_object_agg(method, s) from (select method::text, sum(amount) s from payment_history
               where date = '2026-05-17' and not is_void group by 1) x),
  'cash_by_month', (select json_object_agg(m, s) from (select to_char(entry_date, 'YYYY-MM') m,
                    sum(amount) filter (where direction = 'in') s from cash_book_detail
                    where entry_date between '2026-05-01' and '2026-07-31' group by 1) x),
  'cash_1610', (select json_build_object('in', sum(amount) filter (where direction = 'in'), 'n', count(*))
                from cash_book_detail where entry_date = '2026-10-16'),
  's1a_2026', (select sum(so_tien) from v_s1a_hkd where nam = 2026),
  'tax', (select json_build_object('actual', j -> 'total_actual', 'forecast', j -> 'forecast_total')
          from (select get_tax_threshold_summary(2026)::jsonb j) t),
  'fmr_total', (select sum(net_revenue) from finance_monthly_revenue),
  'mr_total', (select sum(net_revenue) from monthly_revenue)
) as verify;
