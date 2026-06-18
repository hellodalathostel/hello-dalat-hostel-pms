# COMMIT: 2 file backfill migration

## Đã review xong — an toàn để commit
- `20260618000000_backfill_schema_baseline.sql` — Claude.ai đã đọc trực tiếp toàn bộ 729
  dòng, xác nhận khớp schema thật, idempotent đúng, không lỗi.
- `20260618000001_backfill_functions_triggers.sql` — Claude Code đã tự verify bằng diff
  với `pg_get_functiondef()` trực tiếp từ DB, khớp 100% (30 functions, bao gồm bản đã fix
  `add_booking_service_txn`).

## Lệnh cần chạy

```bash
git add supabase/migrations/20260618000000_backfill_schema_baseline.sql
git add supabase/migrations/20260618000001_backfill_functions_triggers.sql
git status
git commit -m "docs: backfill schema baseline + functions/triggers migration history

Repo trước đây chỉ có 4 migration files, thiếu CREATE TABLE history cho 23
bảng public hiện có trong production. 2 file này dump lại schema THẬT
(tables/RLS/GRANT/functions/triggers) để Git phản ánh đúng trạng thái DB.
Idempotent — không thay đổi gì khi apply lại.

Bao gồm fix bug add_booking_service_txn (status check 'confirmed' không
tồn tại trong enum booking_status, đã đổi thành 'booked' — fix riêng đã
deploy production qua migration fix_add_booking_service_txn_status_check)."
```

## KHÔNG push lên remote ở bước này
Chỉ commit local. KHÔNG chạy `git push`, KHÔNG chạy `supabase db push`,
KHÔNG chạy `apply_migration` cho 2 file này (DB đã khớp sẵn, áp lại là dư thừa
dù an toàn vì idempotent).

## Báo cáo lại
1. Output của `git status` và `git commit`.
2. Commit hash.
3. Dừng, chờ Hiếu xác nhận push lên remote khi sẵn sàng.