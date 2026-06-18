# GREP: Xác định RPC nào còn được dùng trong code (legacy audit)

## Bối cảnh
Audit `pg_proc` trong Supabase phát hiện DB có nhiều RPC check-in/check-out trùng mục đích:

| RPC | Tham số | Nghi vấn |
|---|---|---|
| `checkin_booking_txn` | `p_booking_id uuid, p_guests json` | Đang dùng thật (đã xác nhận qua `useCheckIn.ts`) |
| `process_check_in_txn` | `p_booking_id uuid, p_guests jsonb` | Nằm trong docs cũ là "active" — cần xác nhận còn ai gọi không |
| `process_checkin` | `p_booking_id uuid` (KHÔNG có p_guests) | Nghi là legacy/cũ nhất — tên không theo convention `_txn` |
| `process_check_out_txn` | `p_booking_id uuid, p_confirm_debt boolean` | Nằm trong docs cũ là "active" — nhưng API hiện tại ghi rõ `checkout_booking_txn` KHÔNG có `p_confirm_debt`. Cần xác nhận. |

Lưu ý: `process_checkout` (không suffix) KHÔNG xuất hiện trong kết quả audit `pg_proc` —
có thể đã bị drop khỏi DB rồi, hoặc Codex checklist nhìn nhầm tên. Vẫn cần grep để chắc.

## Lệnh cần chạy

```bash
grep -rn "process_check_in_txn" src/ supabase/
grep -rn "process_checkin" src/ supabase/
grep -rn "process_check_out_txn" src/ supabase/
grep -rn "process_checkout" src/ supabase/
grep -rn "checkin_booking_txn" src/ supabase/
grep -rn "checkout_booking_txn" src/ supabase/
```

## Báo cáo lại theo format

Với mỗi RPC, ghi rõ:
- Số lượng match
- File + dòng nếu có match
- Đây là code path thật (frontend hook, Edge Function) hay chỉ là comment/docs cũ trong code

Ví dụ format mong muốn:
```
process_check_in_txn: 0 matches — không còn ai gọi trong code
process_checkin: 0 matches — không còn ai gọi trong code
process_check_out_txn: 2 matches — supabase/functions/telegram-webhook/index.ts:312, supabase/functions/room-report-bot/index.ts:88
process_checkout: 0 matches
checkin_booking_txn: 4 matches — [liệt kê]
checkout_booking_txn: 3 matches — [liệt kê]
```

## KHÔNG tự sửa/xóa gì
Chỉ grep và báo cáo. Việc quyết định DROP RPC nào khỏi DB cần Claude.ai xác nhận sau khi
có kết quả grep đầy đủ — vì DROP FUNCTION là DDL không thể tự ý chạy mà chưa confirm.