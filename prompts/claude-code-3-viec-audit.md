# Nhiệm vụ: 3 việc còn lại sau audit financial tables (02/09/2026)

Bối cảnh: Claude.ai (Lead Dev) đã audit phía DB và đã ghi Brain xong.
**Không ghi Brain trong phiên này.** Không sửa code sản phẩm. Không apply migration.

Làm tuần tự việc 1 → 2 → 3. Báo cáo từng việc theo đúng format yêu cầu.
Nếu một việc cho kết quả bất ngờ (khác hẳn giả định nêu dưới), **dừng lại và báo**, không tự suy diễn tiếp.

Branch: `audit-followup-20260902`

---

## VIỆC 1 — `checkout_booking` có phải bug production đang chảy không?

### Vấn đề
`pg_stat_statements` ghi nhận 64 lượt gọi RPC `checkout_booking`, nhưng hàm này **không còn tồn tại trong `pg_proc`** (đã verify 02/09/2026). Thống kê tích luỹ từ 17/04/2026 nên có 2 khả năng:

- (A) Lịch sử — code từng gọi, đã chuyển sang hàm khác, hàm bị drop. Không có vấn đề.
- (B) Còn code gọi → mọi lần chạy đều lỗi `PGRST202 / function does not exist`. Bug production.

### Cách làm
Tìm chính xác `checkout_booking` **không dính** `checkout_booking_txn`:

```bash
rg -n --hidden -g '!node_modules' -g '!.git' "checkout_booking['\"\`]" .
rg -n --hidden -g '!node_modules' -g '!.git' "\.rpc\(\s*['\"\`]checkout_booking['\"\`]" .
rg -n --hidden -g '!node_modules' -g '!.git' "checkout_booking\b(?!_txn)" -P .
```

Quét cả repo, không chỉ `src/`: bao gồm `supabase/functions/`, `scripts/`, `api/`, `app/`, và repo Telegram bot nếu tách riêng.

### Báo cáo
- Kết luận (A) hay (B), kèm bằng chứng.
- Nếu (B): liệt kê đầy đủ `file:line`, hàm/hook chứa lời gọi, và luồng UI nào chạm tới nó. **Không sửa** — chỉ báo.
- Nếu (A): xác nhận không còn reference nào, kèm số file đã quét.

---

## VIỆC 2 — Ma trận quyền: staff thấy/gọi được những gì?

### Vấn đề
Trong DB, owner và staff **cùng chạy dưới role `authenticated`** — không phân biệt được từ phía DB. Chỉ code mới trả lời được. Ba đối tượng cần xác định:

| Đối tượng | Vì sao cần biết |
|---|---|
| Route `/so-quy` → `CashBookPage` (hook `useCashBook.ts`) | View `cash_book_detail` đọc `expenses` + `pass_through_transactions`. Nếu staff vào được, siết 2 bảng đó sẽ phá sổ quỹ |
| `useTaxThresholdSummary.ts` → RPC `get_tax_threshold_summary` | RPC `SECURITY DEFINER` **không có guard role** → bypass RLS, trả tổng doanh thu + ngưỡng thuế 1 tỷ |
| `useManualRevenue.ts` → RPC `create_manual_revenue_txn` | RPC `SECURITY DEFINER` **không có guard role** → ghi được `revenue_manual_log` |

### Cách làm

```bash
# 2a. Route/nav có bọc ownerOnly không
rg -n -B6 -A6 "so-quy|CashBookPage" --glob "*rout*" --glob "*Nav*" --glob "*App*" --glob "*Layout*" --glob "*Guard*" src/

# 2b. Cơ chế phân quyền UI đang dùng
rg -n "ownerOnly|isOwner|role\s*===\s*['\"]owner|requireRole|ProtectedRoute" src/

# 2c. Ba hook nằm ở màn nào, màn đó nằm sau guard nào
rg -n "useTaxThresholdSummary|useManualRevenue|useCashBook" src/
```

Với mỗi hook: lần ngược lên component → page → route → guard. Nếu chuỗi đứt ở đâu thì ghi rõ đứt ở đâu, đừng đoán.

### Báo cáo — bảng đúng format này

| Đối tượng | Route | Guard trong UI | Staff thấy trên UI? | Staff gọi được qua Data API? |
|---|---|---|---|---|
| `/so-quy` (CashBookPage) | | | | |
| `get_tax_threshold_summary` | | | | |
| `create_manual_revenue_txn` | | | | |

Cột cuối: câu trả lời **luôn là "có"** trừ khi tìm thấy guard ở tầng DB (policy hoặc guard trong thân hàm). `ownerOnly` chỉ ẩn menu, không chặn ai gọi thẳng `/rest/v1/rpc/...` bằng JWT của mình. Ghi "có" kèm ghi chú, đừng ghi "không" vì UI có ẩn.

---

## VIỆC 3 — Backfill migration cho 2 RPC checkout thiếu definition

### Vấn đề
`checkout_last_booking_and_settle_txn` (80 lượt gọi) và `checkout_single_booking_txn` (13 lượt) **tồn tại trong DB nhưng không có `CREATE FUNCTION` trong bất kỳ migration nào**. Lần xuất hiện duy nhất trong `supabase_migrations.schema_migrations` là một dòng comment ở file `20260805092733` (batch ghi quan hệ `frontend_file -> rpc`), không phải definition. Rebuild DB từ migrations → luồng checkout gãy.

Hai hàm được tạo 15/07/2026 và sửa lock order 17/07/2026, cả hai lần đều không qua migration.

### Cách làm

**Bước 1 — dump definition thật từ DB** (Supabase MCP, project `rcfhhgywjdwqcgnpkbtl`):

```sql
SELECT p.proname,
       pg_get_functiondef(p.oid) AS def,
       p.prosecdef,
       pg_get_function_identity_arguments(p.oid) AS args,
       (SELECT string_agg(g.grantee||':'||g.privilege_type, ', ')
          FROM information_schema.role_routine_grants g
         WHERE g.specific_name = p.proname||'_'||p.oid) AS grants
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('checkout_last_booking_and_settle_txn','checkout_single_booking_txn');
```

**Bước 2 — tạo file migration** `supabase/migrations/<YYYYMMDDHHMMSS>_backfill_checkout_rpc_definitions.sql`:

- Dán nguyên `pg_get_functiondef` của cả 2 hàm, đổi `CREATE FUNCTION` → `CREATE OR REPLACE FUNCTION` để idempotent.
- Giữ nguyên `SECURITY DEFINER`, `SET search_path`, và **thứ tự lock booking → group** (quyết định 17/07/2026 — không được đảo).
- Thêm khối GRANT/REVOKE khớp với `grants` lấy ở bước 1, theo checklist chuẩn:
  ```sql
  REVOKE EXECUTE ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon;
  GRANT  EXECUTE ON FUNCTION public.<fn>(<args>) TO authenticated, service_role;
  ```
  Ghi đủ signature từng hàm — không dùng wildcard.
- Đầu file thêm comment: đây là backfill của DDL đã tồn tại trên DB từ 15/07/2026, `CREATE OR REPLACE` nên chạy lại vô hại.

**Bước 3 — file rollback đối xứng**, để cạnh file trên, không đánh số migration.

### Giới hạn — đọc kỹ
- **KHÔNG apply migration.** Chỉ tạo file, commit lên branch, báo cáo. Hiếu và Claude.ai duyệt rồi mới apply.
- Không sửa thân hàm dù thấy chỗ có thể tối ưu. Backfill = chụp lại đúng hiện trạng.
- Không đụng `checkout_booking_txn` / `checkout_group_txn` — decision 15/07/2026 đã chốt "deprecate không xoá".
- Việc này **tách riêng** khỏi module tài chính `fin_*`, không trộn vào cùng branch với nó.

### Báo cáo
- Đường dẫn 2 file đã tạo.
- Diff giữa definition trong DB và những gì đã ghi vào file (kỳ vọng: chỉ khác `CREATE` → `CREATE OR REPLACE`).
- Nếu `pg_get_functiondef` trả về thứ khác kỳ vọng (ví dụ hàm không phải `SECURITY DEFINER`, hoặc lock order là group → booking): **dừng, báo ngay**, không tự sửa cho khớp quyết định cũ.

---

## Tổng kết cuối phiên
Một bảng 3 dòng: việc / trạng thái / thứ cần Hiếu hoặc Claude.ai quyết. Không đề xuất bước tiếp theo ngoài 3 việc trên.