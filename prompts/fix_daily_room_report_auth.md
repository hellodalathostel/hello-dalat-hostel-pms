# FIX: Thêm CRON_SECRET auth check cho daily-room-report

## Bối cảnh
`daily-room-report` đang public hoàn toàn (verify_jwt=false, không check gì trong code) —
trả về `revenue` (số tiền doanh thu) trong response cho bất kỳ ai gọi URL, và bất kỳ ai
cũng trigger được service_role DB query + spam Telegram chat. Hiếu xác nhận dùng chung
`CRON_SECRET` đã có sẵn (đang dùng cho `daily-revenue-summary`).

## Pattern chuẩn (copy nguyên từ daily-revenue-summary, đã verify đang chạy đúng)

```ts
const authHeader = req.headers.get('Authorization')
const cronSecret = Deno.env.get('CRON_SECRET')
if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

## Việc cần làm

1. Mở `supabase/functions/daily-room-report/index.ts`.
2. Tìm dòng đầu tiên trong handler (`Deno.serve(async (req) => {` hoặc tương đương —
   xem code thật để biết chính xác cấu trúc, KHÔNG đoán).
3. Chèn auth check NGAY ĐẦU handler, TRƯỚC bất kỳ DB query hay logic nào khác — dùng đúng
   pattern ở trên, đổi `headers: { 'Content-Type': 'application/json' }` cho khớp style
   header hiện có trong file này nếu khác (ví dụ file này có thể đã có CORS_HEADERS riêng
   — nếu có, dùng `{ ...CORS_HEADERS, "Content-Type": "application/json" }` để nhất quán
   với style file, không phải copy máy móc).
4. KHÔNG đổi gì khác trong file — chỉ thêm đúng đoạn check này.

## Sau khi sửa code

5. Verify `CRON_SECRET` đã tồn tại trong Supabase secrets chưa:
```bash
supabase secrets list | grep CRON_SECRET
```
Nếu đã có (vì `daily-revenue-summary` đang dùng) → không cần set lại, dùng chung.
Nếu KHÔNG thấy → DỪNG LẠI, báo cáo cho Claude.ai, không tự generate secret mới.

6. Deploy:
```bash
supabase functions deploy daily-room-report
```

7. Kiểm tra `supabase/config.toml` — section `[functions.daily-room-report]` hiện có
   `verify_jwt = false`. GIỮ NGUYÊN `verify_jwt = false` (vì cron/external scheduler gọi
   không có Supabase JWT) — auth giờ chỉ dựa vào `CRON_SECRET` check trong code, đây là
   đúng pattern đã áp dụng cho `daily-revenue-summary`. KHÔNG đổi `verify_jwt` thành `true`.

## Báo cáo lại
1. Đoạn code đã chèn (vị trí chính xác trong file).
2. Output `supabase secrets list | grep CRON_SECRET` (CHỈ xác nhận có/không tồn tại,
   KHÔNG paste giá trị secret thật ra report).
3. Output deploy.
4. Dừng — không tự test gọi thử endpoint với secret thật (tránh lộ secret trong log/report).