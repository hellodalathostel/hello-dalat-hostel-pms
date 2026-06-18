# BACKFILL: Tạo migration file phản ánh schema thật (23 bảng public)

## Bối cảnh
Audit xác nhận: DB thật có 23 bảng trong `public` schema, TẤT CẢ đã có RLS enabled đúng.
Nhưng repo chỉ có 4 migration files (toàn là ALTER/RLS-policy/RPC, không có file nào
CREATE TABLE). Nghĩa là lịch sử tạo bảng không được track qua Git — vi phạm nguyên tắc
số 5 ("Migration qua file SQL — không sửa Dashboard").

Mục tiêu: tạo 1 migration file backfill duy nhất, chứa DDL đầy đủ của 23 bảng + RLS +
policies + GRANT hiện tại, để từ giờ repo phản ánh đúng DB thật. Đây là file "checkpoint",
không thay đổi gì trong DB — chỉ ghi lại trạng thái hiện tại vào Git.

## Bước 1 — Dump schema thật (không phải data)

Trong Codespaces, project đã link (`rcfhhgywjdwqcgnpkbtl`). Chạy:

```bash
supabase db dump --schema public --linked > /tmp/schema_dump_raw.sql
```

Nếu lệnh trên lỗi hoặc Supabase CLI version không hỗ trợ `--linked` cho dump schema-only,
thử:

```bash
supabase db dump --schema public -f /tmp/schema_dump_raw.sql
```

Báo lại nếu cả 2 đều lỗi — đừng tự đoán flag khác, dừng và hỏi.

## Bước 2 — Lọc bỏ phần không cần

File dump thô thường chứa:
- `CREATE EXTENSION` (đã có sẵn trong DB, không cần re-run, nhưng giữ lại với `IF NOT EXISTS` không sao)
- `COMMENT ON` (giữ lại nếu có, không hại gì)
- Có thể chứa cả bảng hệ thống/extension (postgis, pg_net, v.v.) — CHỈ giữ lại DDL của
  23 bảng nghiệp vụ: `app_users`, `booking_discounts`, `booking_guests`, `booking_requests`,
  `booking_services`, `bookings`, `bot_leads`, `cash_transactions`, `customers`,
  `document_logs`, `expenses`, `groups`, `ops_tasks`, `ota_calendar_feed`, `payment_history`,
  `pricing_rules`, `revenue_manual_log`, `room_blocks`, `room_issues`, `rooms`, `services`,
  `telegram_task_sessions`, `tours`.

Xóa DDL của bất kỳ bảng/extension nào KHÔNG nằm trong 23 bảng trên khỏi file.

## Bước 3 — Verify RLS + GRANT đã có trong dump

`supabase db dump --schema public` thường KHÔNG tự động export `ALTER TABLE ... ENABLE ROW
LEVEL SECURITY`, `CREATE POLICY`, hay `GRANT` — cần dump riêng. Chạy:

```bash
supabase db dump --schema public --linked --data-only=false -f /tmp/schema_dump_full.sql
```

Nếu vẫn thiếu RLS/policy/grant trong output, lấy trực tiếp qua psql connection string
(Codespaces đã có quyền qua Supabase CLI):

```bash
supabase db dump --linked --role-only -f /tmp/roles_dump.sql 2>/dev/null || echo "role-only flag not supported, skip"
```

Hoặc đơn giản nhất — generate riêng phần RLS/GRANT bằng cách query trực tiếp qua psql nếu
Claude Code có connection string (`supabase status` để lấy), rồi nối vào cuối file dump.

**Quan trọng:** nếu việc tự động dump RLS/policy/grant quá phức tạp hoặc lỗi, dừng lại,
báo cáo lại đã dump được phần CREATE TABLE chưa, và Claude.ai sẽ cung cấp phần
RLS/policy/GRANT thủ công (Claude.ai có thể query trực tiếp pg_policies +
information_schema.role_table_grants qua Supabase MCP và viết sẵn).

## Bước 4 — Đặt tên và vị trí file

Tên file theo convention: `supabase/migrations/20260618000000_backfill_schema_baseline.sql`

Header bắt buộc đầu file:
```sql
-- ============================================================================
-- BACKFILL MIGRATION — Schema baseline checkpoint
-- Ngày tạo: 2026-06-18
-- Mục đích: Repo trước đây chỉ có 4 migration files (ALTER/RLS/RPC), không có
-- CREATE TABLE history cho 23 bảng public hiện có trong DB. File này dump lại
-- schema THẬT đang chạy production để Git phản ánh đúng trạng thái DB.
-- File này KHÔNG thay đổi gì trong DB khi apply lại (idempotent) — chỉ là
-- checkpoint lịch sử. Từ giờ, MỌI thay đổi schema phải qua migration file mới,
-- không sửa Dashboard (nguyên tắc số 5).
-- ============================================================================
```

## Bước 5 — KHÔNG tự apply migration này
Đây là file ghi lại trạng thái ĐÃ TỒN TẠI trong DB — nếu apply lại có thể gây lỗi
"already exists" hoặc (nếu không cẩn thận với IF NOT EXISTS) gây side effect không mong muốn.

**Việc bắt buộc:** dùng `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY` (idempotent tự nhiên — chạy lại không lỗi), `CREATE POLICY IF NOT EXISTS` hoặc
`DROP POLICY IF EXISTS ... ; CREATE POLICY ...` để an toàn khi re-run, `GRANT` (idempotent
tự nhiên).

Sau khi tạo file xong:
1. Chỉ commit file vào Git, KHÔNG chạy `supabase db push` hay `apply_migration` để áp lại.
2. Báo cáo lại: đường dẫn file, số dòng, có verify được RLS/GRANT đầy đủ trong file không.
3. Dừng, chờ Claude.ai review nội dung trước khi merge vào `main`.