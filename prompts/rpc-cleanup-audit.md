# RPC Cleanup Audit — grep-only, KHÔNG xóa/sửa gì

## Mục đích
Đối chiếu 32 function trong DB (liệt kê dưới) với code thực tế trong repo để biết
function nào ĐANG được gọi và function nào có vẻ KHÔNG còn ai gọi (candidate để
deprecate). Đây chỉ là audit — không tự xóa function nào, không tự sửa code nào.

## Cách grep
Với MỖI function trong danh sách dưới, tìm trong toàn bộ repo (`src/`,
`supabase/functions/`) các pattern:
```
.rpc('function_name'
.rpc("function_name"
rpc(`function_name`
```
(cả 3 kiểu quote, vì code có thể dùng single/double/backtick quote)

Cũng tìm xem function đó có được gọi gián tiếp qua tên khác không (vd alias,
wrapper hook) — nếu thấy gọi gián tiếp, ghi rõ qua hook/file nào.

## Danh sách 32 function cần check

### Nhóm RPC nghiệp vụ (30 — khả năng cao có dùng, nhưng vẫn cần confirm từng cái)
add_booking_service_txn
add_booking_to_group_txn
add_discount_txn
add_early_late_txn
cancel_ota_block
check_room_availability
checkin_booking_txn
checkout_booking_txn
checkout_group_txn
confirm_booking_request_txn
create_document_log
create_group_booking_txn
create_manual_revenue_txn
create_room_block_txn
current_user_role
delete_booking_discount_txn
delete_booking_service_txn
delete_room_block_txn
get_suggested_price
get_tax_threshold_summary
log_room_issue_txn
mark_room_clean_txn
record_payment_txn
update_booking_txn
update_housekeeping_status
upsert_brain_daily_log
void_checkedout_booking_txn
void_payment_txn

### Nhóm nghi vấn riêng (2 — không attach trigger nào trong DB, không rõ còn dùng)
update_updated_at_column   -- nghi trùng chức năng với set_updated_at (đang dùng cho 13 trigger khác)
rls_auto_enable            -- không thấy attach trigger nào, không rõ mục đích còn dùng

## Output format

Markdown table:

| Function | Gọi từ RPC client? (file:line nếu có) | Gọi gián tiếp qua đâu? | Kết luận |
|---|---|---|---|
| add_booking_service_txn | ✅ src/hooks/useServiceActions.ts:24 | — | Đang dùng |
| rls_auto_enable | ❌ Không tìm thấy | — | Candidate deprecate — cần Hiếu xác nhận trước khi drop |

Cuối file, liệt kê riêng danh sách "Candidate để deprecate" (function KHÔNG tìm
thấy reference nào trong code) để Hiếu + Claude.ai quyết định bước tiếp theo
(có thể vẫn đang dùng qua Notion automation / Telegram bot / cron job mà
không phải `.rpc()` trực tiếp — cần xác nhận kỹ trước khi drop bất kỳ cái gì).

## KHÔNG làm
- Không drop function nào
- Không sửa code nào
- Không tạo migration nào
Chỉ báo cáo.