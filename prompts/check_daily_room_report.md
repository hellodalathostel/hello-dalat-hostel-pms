# KIỂM TRA: Auth của daily-room-report Edge Function

## Bối cảnh
Codex review báo Critical: `daily-room-report` có `verify_jwt=false` trong
`supabase/config.toml`, khác với `submit-booking-request` (public form hợp lệ) hay
`telegram-webhook`/`ical-feed` (đã biết rõ lý do cần public). Cần xác nhận function này
có cơ chế auth riêng nào không (ví dụ CRON_SECRET như `daily-revenue-summary`), hay đang
mở hoàn toàn public không có gì chặn.

## Bước 1 — Đọc code function

```bash
cat supabase/functions/daily-room-report/index.ts
```

Tìm các pattern sau trong code:
- Có check `Authorization: Bearer` header so với secret nào không (giống
  `CRON_SECRET` mà `daily-revenue-summary` dùng)?
- Có check `ALLOWED_CHAT_ID` hoặc tương đương (giống `telegram-webhook`)?
- Function này làm gì — trả về data gì? Có chứa thông tin nhạy cảm (doanh thu, khách,
  PII) hay chỉ là thông tin phòng/housekeeping công khai được?

## Bước 2 — Xác nhận trong config.toml

```bash
grep -A 5 "daily-room-report" supabase/config.toml
```

## Bước 3 — Báo cáo theo 1 trong các case

### Case A — Có cơ chế auth riêng (secret check trong code)
Báo: "An toàn — function có check [tên secret/mechanism] trong code dù verify_jwt=false
ở config level."

### Case B — Không có auth nào, nhưng data trả về không nhạy cảm
Báo rõ: function trả về cái gì, và nói rõ liệu data đó (ví dụ: tình trạng phòng, lịch dọn
phòng) có ổn nếu public không cần auth hay không. KHÔNG tự kết luận "an toàn" — chỉ mô tả
sự thật để Claude.ai quyết định.

### Case C — Không có auth nào, VÀ data trả về nhạy cảm (doanh thu, tên khách, SĐT, v.v.)
Đây là lỗ hổng thật — báo cáo chi tiết: function trả về field gì, ai có thể gọi (chỉ cần
biết URL, không cần token), endpoint đầy đủ là gì.

## KHÔNG tự sửa gì
Chỉ đọc code và báo cáo theo 1 trong 3 case trên. Việc quyết định bật verify_jwt hay thêm
secret check sẽ làm ở bước sau, sau khi biết rõ function này thực chất làm gì.