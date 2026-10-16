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
