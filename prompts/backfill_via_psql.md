# BACKFILL (tiếp) — Dump schema qua psql/pg_dump trực tiếp, không cần Docker

## Bối cảnh
Codespace không có Docker nên `supabase db dump` (CLI) không chạy được. Dùng `pg_dump`
chuẩn của Postgres trực tiếp qua connection string — không cần Docker, chỉ cần `pg_dump`
client đã có sẵn trong devcontainer (kiểm tra bằng `pg_dump --version`; nếu thiếu, cài qua
`apt-get install -y postgresql-client` trong Codespace, không phải Docker).

## Bước 1 — Lấy connection string

```bash
supabase status
```

Tìm dòng `DB URL` hoặc tương đương trong output. Nếu `supabase status` không trả về
connection string trực tiếp (vì project là remote/linked, không phải local), dùng
connection string dạng:

```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

Lấy đúng connection string thật từ Supabase Dashboard → Project Settings → Database →
Connection string (mode: **Session** hoặc **Direct connection**, KHÔNG dùng Transaction
pooler mode vì `pg_dump` cần session-based connection).

**Nếu không có sẵn password/connection string trong env của Codespace** → dừng lại, báo cáo
cho Claude.ai biết cần gì, KHÔNG tự đoán hoặc hardcode password vào file/log.

## Bước 2 — pg_dump schema-only cho 23 bảng

```bash
pg_dump "[CONNECTION_STRING]" \
  --schema-only \
  --schema=public \
  --table=app_users --table=booking_discounts --table=booking_guests \
  --table=booking_requests --table=booking_services --table=bookings \
  --table=bot_leads --table=cash_transactions --table=customers \
  --table=document_logs --table=expenses --table=groups --table=ops_tasks \
  --table=ota_calendar_feed --table=payment_history --table=pricing_rules \
  --table=revenue_manual_log --table=room_blocks --table=room_issues \
  --table=rooms --table=services --table=telegram_task_sessions --table=tours \
  --no-owner --no-privileges \
  > /tmp/schema_dump.sql
```

`--no-owner --no-privileges`: bỏ `OWNER TO` và GRANT mặc định của pg_dump (vì pg_dump
generate GRANT theo role hiện tại của connection, không phải role thật cần — `anon`/
`authenticated`/`service_role` sẽ được thêm riêng ở Bước 3, lấy đúng từ DB thật).

`pg_dump --schema-only` **CÓ** export RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
và `CREATE POLICY` mặc định — khác với `supabase db dump` CLI. Verify sau khi dump xong
bằng cách grep:

```bash
grep -c "ENABLE ROW LEVEL SECURITY" /tmp/schema_dump.sql
grep -c "CREATE POLICY" /tmp/schema_dump.sql
```

Báo lại 2 số này.

## Bước 3 — GRANT thật (đã audit qua Supabase MCP — dùng nguyên, không tự đoán)

Claude.ai đã audit `information_schema.role_table_grants` cho toàn bộ `public` schema.
Kết quả thật: **TẤT CẢ 23 bảng đều có GRANT đầy đủ (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
REFERENCES/TRIGGER) cho cả 3 role: `anon`, `authenticated`, `service_role`.**

Đây là pattern nhất quán cho mọi bảng — không có ngoại lệ. Lý do GRANT anon vẫn an toàn:
RLS policy chỉ target `{authenticated}`, không có policy nào cho `{anon}` → RLS deny-all
chặn anon hoàn toàn dù GRANT ở tầng SQL rộng. Đã xác nhận với Hiếu: Staff (Lợi) cần full
access như Owner trên hầu hết bảng (chủ ý thiết kế, hostel nhỏ 1 staff).

**Dùng đúng GRANT sau cho TẤT CẢ 23 bảng** (thêm vào cuối file dump, sau phần CREATE TABLE +
RLS + POLICY):

```sql
-- GRANT — khớp đúng trạng thái thật trong DB (audit 2026-06-18), giữ nguyên không đổi
GRANT ALL ON public.app_users TO anon, authenticated, service_role;
GRANT ALL ON public.booking_discounts TO anon, authenticated, service_role;
GRANT ALL ON public.booking_guests TO anon, authenticated, service_role;
GRANT ALL ON public.booking_requests TO anon, authenticated, service_role;
GRANT ALL ON public.booking_services TO anon, authenticated, service_role;
GRANT ALL ON public.bookings TO anon, authenticated, service_role;
GRANT ALL ON public.bot_leads TO anon, authenticated, service_role;
GRANT ALL ON public.cash_transactions TO anon, authenticated, service_role;
GRANT ALL ON public.customers TO anon, authenticated, service_role;
GRANT ALL ON public.document_logs TO anon, authenticated, service_role;
GRANT ALL ON public.expenses TO anon, authenticated, service_role;
GRANT ALL ON public.groups TO anon, authenticated, service_role;
GRANT ALL ON public.ops_tasks TO anon, authenticated, service_role;
GRANT ALL ON public.ota_calendar_feed TO anon, authenticated, service_role;
GRANT ALL ON public.payment_history TO anon, authenticated, service_role;
GRANT ALL ON public.pricing_rules TO anon, authenticated, service_role;
GRANT ALL ON public.revenue_manual_log TO anon, authenticated, service_role;
GRANT ALL ON public.room_blocks TO anon, authenticated, service_role;
GRANT ALL ON public.room_issues TO anon, authenticated, service_role;
GRANT ALL ON public.rooms TO anon, authenticated, service_role;
GRANT ALL ON public.services TO anon, authenticated, service_role;
GRANT ALL ON public.telegram_task_sessions TO anon, authenticated, service_role;
GRANT ALL ON public.tours TO anon, authenticated, service_role;
```

KHÔNG cần audit thêm hay tự đoán gì ở bước này — dùng nguyên block trên.

## Bước 4 — Ghép file

Nối header (đã có sẵn trong `backfill_schema_migration.md` Bước 4) + nội dung
`/tmp/schema_dump.sql` (đã lọc) + GRANT block (nếu cần thêm thủ công) thành 1 file:

```
supabase/migrations/20260618000000_backfill_schema_baseline.sql
```

## Bước 5 — Báo cáo

1. Connection string lấy được từ đâu (status/dashboard) — KHÔNG paste password thật vào
   báo cáo, chỉ nói "đã lấy được" hoặc "thiếu, cần Hiếu cung cấp".
2. Số dòng file cuối cùng.
3. Kết quả 2 lệnh `grep -c` ở Bước 2.
4. Danh sách bảng nào (nếu có) bị thiếu GRANT cho `anon`/`authenticated` mà cần Claude.ai
   audit thêm.
5. Dừng, KHÔNG tự apply migration này (giữ nguyên rule cũ).