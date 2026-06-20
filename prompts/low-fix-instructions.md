# Low Fixes — 3 nitpick cuối cùng từ báo cáo Codex

## L1 — Typo casing migration (chỉ sửa file lịch sử, KHÔNG re-run)

File: `supabase/migrations/20260512010000_room_blocks_rls.sql`

Migration này đã apply rồi (Postgres không phân biệt case keyword nên chạy đúng
từ trước) — fix này chỉ làm sạch file lịch sử trong repo, không cần re-run gì.

Thay:
```sql
aLTER TABLE room_blocks ENABLE ROW LEVEL SECURITY;
```
Bằng:
```sql
ALTER TABLE room_blocks ENABLE ROW LEVEL SECURITY;
```

## L2 — Telegram nights label sai đơn vị (2 chỗ, cần REDEPLOY function)

File: `supabase/functions/telegram-webhook/index.ts`

**Chỗ 1** — trong `handleToday` (khoảng dòng 105):

Thay:
```typescript
      if (b.nights) msg += ` (${b.nights}đ)`;
```
Bằng:
```typescript
      if (b.nights) msg += ` (${b.nights} đêm)`;
```

**Chỗ 2** — trong `handleNext` (khoảng dòng 174):

Thay:
```typescript
      if (b.nights) parts.push(`${b.nights}đ`);
```
Bằng:
```typescript
      if (b.nights) parts.push(`${b.nights} đêm`);
```

**Sau khi sửa: deploy lại function**
```bash
supabase functions deploy telegram-webhook --no-verify-jwt
```
(Theo nguyên tắc dự án: luôn deploy `telegram-webhook` với `--no-verify-jwt`,
security qua `ALLOWED_CHAT_ID` check.)

## L3 — Hardcode Notion database id

File: `supabase/functions/task-reminder/index.ts`

Thay:
```typescript
const NOTION_TASK_DB_ID = "2b3cd2c9-6b3a-4f39-963e-de01d5ff28dc";
```
Bằng:
```typescript
const NOTION_TASK_DB_ID = Deno.env.get("NOTION_TASK_DB_ID")!;
```

**Không cần set secret mới** — đã confirm `NOTION_TASK_DB_ID` đã tồn tại trong
Supabase secrets (function `telegram-webhook` đã dùng đúng pattern này từ trước
ở 2 chỗ khác, dòng ~496 và ~616). Chỉ cần deploy lại `task-reminder`:

```bash
supabase functions deploy task-reminder
```

## Sau khi áp dụng cả 3
- Không cần `tsc` check (đây là Deno Edge Functions + 1 file SQL, không thuộc
  Vite/TS build pipeline của frontend).
- Deploy lại 2 Edge Functions: `telegram-webhook` và `task-reminder` (xem lệnh ở trên).
- Test nhanh: gửi `/today` hoặc `/next` qua Telegram bot, xác nhận hiển thị
  đúng "X đêm" thay vì "Xđ".
- Commit: `fix: typo casing migration, nights label unit, hardcode Notion DB id (Low findings)`