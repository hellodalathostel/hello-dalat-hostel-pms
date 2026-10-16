-- =====================================================================
-- Dọn dữ liệu TEST tạo bởi review QA 15/10/2026 (SĐT giả 0900000000, hậu tố QA1510)
-- Script dọn MỘT LẦN — KHÔNG phải migration schema. Đã chạy 16/10/2026, Hiếu đã xác nhận danh sách.
-- Chỉ dùng RPC _txn có sẵn; riêng ops_tasks không có RPC → UPDATE status (không xoá).
-- =====================================================================

-- A2.1 Void 2 payment của HD271015201 (group 04b75883-…)
select void_payment_txn('729239e5-a5f6-492a-9cbb-e72fec9d090d', 'Don du lieu TEST QA1510'); -- 200.000 cash
select void_payment_txn('66ab960c-9799-4c4d-a7db-64d2669493ea', 'Don du lieu TEST QA1510'); -- 400.000 transfer

-- A2.2 Huỷ các booking TEST còn hoạt động (HD271015102 đã huỷ từ trước)
select update_booking_txn(p_booking_id := 'bb6ffb4d-49ca-42f6-be79-1d3df594fba7', p_cancel := true); -- HD271015201
select update_booking_txn(p_booking_id := '50daa82b-5e3f-4206-80df-869a3975d04c', p_cancel := true); -- HD271015101
select update_booking_txn(p_booking_id := '8926197b-6666-480f-bcea-de7651f5aee8', p_cancel := true); -- HD271015203 (phòng 301)

-- A2.3 Xoá block phòng 101 (15–16/10/2028, note "TEST-Room block QA1510")
select delete_room_block_txn('f2f0863f-a612-43f2-a5f8-726ee6a994bb');

-- A2.4 Task TEST trong ops_tasks → 'Bo Qua' (chỉ task gắn booking TEST đã xác nhận)
--      Thực tế: trigger huỷ booking đã tự đặt 'Bo Qua' + ghi_chu 'AUTO: booking huy/xoa' cho 590–595,
--      nên UPDATE dưới đây không đổi dòng nào (giữ lại cho idempotent).
update ops_tasks
   set status = 'Bo Qua',
       ghi_chu = coalesce(nullif(ghi_chu, '') || ' | ', '') || 'Don du lieu TEST QA1510',
       updated_at = now()
 where id in (590, 591, 592, 593, 594, 595)
   and booking_id in ('bb6ffb4d-49ca-42f6-be79-1d3df594fba7',
                      '50daa82b-5e3f-4206-80df-869a3975d04c',
                      '8926197b-6666-480f-bcea-de7651f5aee8')
   and status <> 'Bo Qua';

-- A2.5 Khách TEST: A1 không tìm thấy customer nào (TEST-%, 0900000000, CCCD 000000000)
--      → check-in treo chưa tạo khách, không cần xử lý.
-- A2.6 booking_requests: không có bản ghi QA1510. Có 5 request "Test" cũ (06/2026, 02/10/2026)
--      đã rejected/confirmed — chỉ báo cáo, không xử lý.

-- A2.7 Verify
select b.code, b.status, b.is_deleted, g.paid, g.grand_total
  from bookings b join groups g on g.id = b.group_id
 where b.code in ('HD271015201','HD271015101','HD271015203','HD271015102');
select id, amount, is_void, voided_payment_id from payment_history
 where group_id in ('04b75883-f4f4-438f-a74d-c79024d7699f','bd8cf2c7-ab64-4d3a-9090-f468cf404ee5');
select count(*) as test_blocks from room_blocks where note ilike 'TEST-Room block QA1510%';
select id, status from ops_tasks where id between 590 and 597 order by id;


-- =====================================================================
-- PHẦN VERIFY BỔ SUNG (16/10/2026, phiên QA cleanup) — CHỈ SELECT
-- Các lệnh ở trên đã chạy lúc 2026-10-16 07:34 (+07). Phần dưới chạy lại được bất kỳ lúc nào.
-- =====================================================================
-- Hiếu quyết định (16/10/2026) GIỮ NGUYÊN, không xử lý:
--   - 2 group TEST (status 'active', grand_total = 0, paid = 0)
--       bd8cf2c7-ab64-4d3a-9090-f468cf404ee5  TEST-Group-QA1510
--       04b75883-f4f4-438f-a74d-c79024d7699f  TEST-Nguyen Van A-QA1510
--   - Dịch vụ Coca-Cola 300ml 15.000đ gắn HD271015203 (booking đã huỷ)
--   - document_logs hoá đơn PDF của group TEST-Nguyen Van A
--   - booking_requests tên "Test" cũ (06/2026, 02/10/2026) — không thuộc QA1510
--
-- Tên thật: bảng thanh toán là payment_history; mã booking là bookings.code.
-- =====================================================================

-- 1. Booking TEST: kỳ vọng 4 dòng, đều cancelled + is_deleted = true
select b.id, b.code, b.group_id, g.customer_name, b.room_id, b.status,
       b.check_in, b.check_out, b.is_deleted, b.grand_total
from bookings b
join groups g on g.id = b.group_id
where b.code in ('HD271015201', 'HD271015101', 'HD271015203', 'HD271015102')
   or g.customer_name ilike 'TEST-%'
   or g.customer_phone = '0900000000'
order by b.code;

-- 2. Group TEST: kỳ vọng paid = 0, grand_total = 0
select id, customer_name, customer_phone, status, is_deleted, paid, grand_total, net_revenue
from groups
where id in ('bd8cf2c7-ab64-4d3a-9090-f468cf404ee5', '04b75883-f4f4-438f-a74d-c79024d7699f');

-- 3. Payment TEST: kỳ vọng 4 dòng (2 gốc + 2 đảo), tất cả is_void = true, tổng = 0
select id, group_id, amount, method, date, is_void, voided_payment_id, note, created_at
from payment_history
where group_id in ('bd8cf2c7-ab64-4d3a-9090-f468cf404ee5', '04b75883-f4f4-438f-a74d-c79024d7699f')
order by created_at;

select coalesce(sum(amount), 0) as tong_payment_test
from payment_history
where group_id in ('bd8cf2c7-ab64-4d3a-9090-f468cf404ee5', '04b75883-f4f4-438f-a74d-c79024d7699f');

-- 4. Room block TEST: kỳ vọng 0 dòng
select id, room_id, start_date, end_date, note
from room_blocks
where note ilike '%QA1510%'
   or (room_id = '101' and start_date between '2028-10-15' and '2028-10-16');

-- 5. ops_tasks gắn booking TEST: kỳ vọng 8 dòng (590–597), tất cả 'Bo Qua'
select t.id, t.task_name, t.task_date, t.status, t.room_id, t.booking_id, t.ghi_chu
from ops_tasks t
join bookings b on b.id = t.booking_id
where b.code in ('HD271015201', 'HD271015101', 'HD271015203', 'HD271015102')
order by t.id;

-- 6. Khách TEST: kỳ vọng 0 dòng
select c.id, c.full_name, c.phone, count(bg.id) as so_booking_tham_chieu
from customers c
left join booking_guests bg on bg.customer_id = c.id
where c.full_name ilike 'TEST-%'
   or c.phone = '0900000000'
   or c.document_number = '000000000'
group by c.id, c.full_name, c.phone;

-- 7. Doanh thu ngày 15–16/10/2026: booking TEST không được lọt vào báo cáo
--    Kết quả chạy 16/10/2026:
--      15/10: payment_history (mọi dòng) = 600.000, không void = 0, sổ quỹ thu = 0,
--             daily_revenue = 0, S1a = 946.892 (booking thật)
--      16/10: payment_history (mọi dòng) = -57.385 (gồm -600.000 đảo TEST),
--             không void = 542.615, sổ quỹ thu = 542.615, daily_revenue = 1.091.322
--      Booking TEST trong daily_revenue / v_s1a_hkd / finance_monthly_revenue: 0 dòng
--    → Mọi báo cáo phải lọc is_void = false; cộng thô payment_history theo ngày
--      sẽ ra +600.000 ngày 15 và -600.000 ngày 16 (tổng bằng 0 nhưng lệch từng ngày).
with d as (select unnest(array['2026-10-15'::date, '2026-10-16'::date]) as dt)
select d.dt,
  (select coalesce(sum(amount), 0) from payment_history where date = d.dt) as ph_moi_dong,
  (select coalesce(sum(amount), 0) from payment_history where date = d.dt and not is_void) as ph_khong_void,
  (select coalesce(sum(amount) filter (where direction = 'in'), 0) from cash_book_detail where entry_date = d.dt) as so_quy_thu,
  (select coalesce(sum(room_net_revenue + service_revenue), 0) from daily_revenue where stay_date = d.dt) as doanh_thu_ngay,
  (select coalesce(sum(so_tien), 0) from v_s1a_hkd where ngay_ghi_so = d.dt) as s1a
from d;

select
  (select count(*) from daily_revenue
     where group_id in ('bd8cf2c7-ab64-4d3a-9090-f468cf404ee5', '04b75883-f4f4-438f-a74d-c79024d7699f')) as daily_revenue_test,
  (select count(*) from v_s1a_hkd v join bookings b on b.id = v.booking_id
     where b.code in ('HD271015201', 'HD271015101', 'HD271015203', 'HD271015102')) as s1a_test,
  (select count(*) from finance_monthly_revenue
     where group_id in ('bd8cf2c7-ab64-4d3a-9090-f468cf404ee5', '04b75883-f4f4-438f-a74d-c79024d7699f')) as finance_test;

-- 8. Ngưỡng thuế 2026: tháng 10 phải khớp S1a tháng 10 (tới hôm nay)
--    Kết quả chạy 16/10/2026: by_month[10] = 5.930.926 = S1a T10; total_actual = 317.319.554 = S1a 2026
select get_tax_threshold_summary(2026) as tom_tat;

select sum(so_tien) as s1a_thang_10_toi_hom_nay
from v_s1a_hkd
where nam = 2026 and thang = 10 and ngay_ghi_so <= current_date;
