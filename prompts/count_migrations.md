# KIỂM TRA: Số lượng migration files thật trong repo

## Bối cảnh
Codex review chỉ đọc được 4 migration files trong `supabase/migrations/`, không thấy
`CREATE TABLE` cho hầu hết bảng vận hành (bookings, groups, payments, customers...).
Đã audit DB thật qua Supabase MCP — xác nhận TOÀN BỘ 24 bảng trong public schema ĐÃ CÓ
RLS enabled thật. Vậy schema/RLS trong DB là đúng — câu hỏi còn lại là: **migration files
trong repo có phản ánh đúng lịch sử tạo bảng không, hay nhiều bảng được tạo qua Dashboard/MCP
trực tiếp mà không commit migration file?**

Đây là vi phạm nguyên tắc số 5 ("Migration qua file SQL — không sửa Dashboard") nếu đúng,
dù không phải lỗ hổng bảo mật.

## Lệnh cần chạy

```bash
ls -la supabase/migrations/ | wc -l
ls supabase/migrations/
```

## Báo cáo lại

1. Tổng số file migration thật (không tính file ẩn `.` `..`)
2. Liệt kê tên từng file (để Claude.ai đối chiếu ngày tạo với các mốc đã biết:
   `20260510000100`, `20260512010000`, `20260512020000`, `20260617000000` — đây là 4 file
   Codex đã đọc được)
3. Nếu có MIGRATION nào khác ngoài 4 file này → liệt kê đầy đủ tên file
4. Nếu chỉ có đúng 4 file → xác nhận rõ: "Repo chỉ có 4 migration files thật — các bảng
   còn lại (bookings, groups, payment_history, customers, v.v.) không có migration file
   tương ứng trong repo, dù đã tồn tại và có RLS đúng trong DB thật."

## KHÔNG tự tạo migration backfill ở bước này
Chỉ đếm và báo cáo. Quyết định có cần tạo file `schema dump` backfill hay không sẽ làm
ở bước sau, sau khi Claude.ai xem kết quả.