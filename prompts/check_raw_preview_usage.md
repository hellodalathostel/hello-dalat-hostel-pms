# KIỂM TRA: raw_preview có được frontend dùng không?

## Mục đích
Trước khi deploy `checkin-processor` đã xóa field `raw_preview` khỏi response body,
cần xác nhận không có frontend code nào đọc field này — nếu có, xóa sẽ làm UI hỏng
(hiển thị `undefined` hoặc lỗi runtime) thay vì chỉ là fix bảo mật.

## Lệnh cần chạy

```bash
grep -rn "raw_preview" src/
```

Tìm trong toàn bộ `src/` — đặc biệt các chỗ gọi `checkin-processor`:
- Component nào invoke Edge Function này (search thêm: `grep -rn "checkin-processor" src/`)
- Bất kỳ chỗ nào destructure response như `data.raw_preview`, `result.raw_preview`,
  hoặc đọc qua `error.detail`/`error.raw_preview` trong catch block

## Báo cáo lại theo 1 trong 2 case

### Case A — Không có kết quả nào (grep rỗng)
→ An toàn, field `raw_preview` chưa từng được dùng ở frontend. Báo lại:
"Grep rỗng — không có frontend code đọc raw_preview. An toàn để deploy."

### Case B — Có kết quả
→ Liệt kê đầy đủ: file nào, dòng nào, đang dùng raw_preview để làm gì (hiển thị cho user?
chỉ log? điều kiện rẽ nhánh logic?). KHÔNG tự sửa thêm gì — chỉ báo cáo lại để Claude.ai
quyết định: giữ lại field này trong response (nhưng vẫn phải đảm bảo không chứa PII thật,
có thể cần truncate khác) hoặc cập nhật luôn phần frontend đang dùng nó.

## Sau khi có kết quả
Chờ Claude.ai xác nhận trước khi chạy:
```
supabase functions deploy checkin-processor
```
(kiểm tra `supabase/config.toml` xem function này có cần flag `--no-verify-jwt` không —
theo skill hello-dalat-pms-dev, chỉ `telegram-webhook` và `ical-feed` được xác nhận cần flag này;
`checkin-processor` chưa có trong list đó nên nhiều khả năng KHÔNG cần — nhưng vẫn nên đọc
`config.toml` thật để chắc, đừng đoán.)