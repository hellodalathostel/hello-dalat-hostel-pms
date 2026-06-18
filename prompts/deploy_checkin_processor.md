# DEPLOY: checkin-processor (đã confirm an toàn)

## Xác nhận trước khi chạy
- Grep `raw_preview` trong `src/` → rỗng, không có frontend nào đọc field này. An toàn.
- `config.toml` không có `[functions.checkin-processor]` → dùng default verify-jwt, KHÔNG cần
  flag `--no-verify-jwt`.

## Lệnh deploy

```bash
supabase functions deploy checkin-processor
```

## Sau khi deploy xong
1. Báo lại output của lệnh deploy (thành công/lỗi).
2. KHÔNG chạy test check-in thật ở bước này — Hiếu sẽ tự test sau qua giao diện thật khi cần,
   tránh tạo booking/guest test trong production data.
3. Dừng tại đây, chờ chỉ dẫn tiếp theo.