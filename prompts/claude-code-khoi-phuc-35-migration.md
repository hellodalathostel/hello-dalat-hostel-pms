# Nhiệm vụ: khôi phục 35 file migration bị thiếu trong repo

Repo: `D:\hello-dalat-hostel-pms` · Project Supabase: `rcfhhgywjdwqcgnpkbtl`
Branch mới từ `main`: `fix/restore-missing-migrations-20260904`

## Bối cảnh

`npx supabase migration list` ngày 04/09/2026 cho thấy 36 migration đã apply trên production nhưng **không có file nào trong git** — gần như toàn bộ công việc tháng 8/2026. Nguyên nhân: DDL được apply bằng Supabase MCP `apply_migration` thay vì `supabase db push`, nên `schema_migrations` có bản ghi còn repo thì không.

Tin tốt: **`supabase_migrations.schema_migrations` lưu đủ cả `name` lẫn toàn bộ `statements`.** Việc này là ghi ngược ra file, không phải viết lại từ đầu.

**TUYỆT ĐỐI KHÔNG:**
- Không `supabase db push`, không `db reset`, không apply lại bất cứ thứ gì. Toàn bộ 35 migration này **đã chạy trên production rồi**.
- Không dùng MCP `apply_migration`.
- Không đụng file `20260814120000_brain_graph_v4_stage4_snapshots_and_currency_views.sql` — Claude.ai xử riêng, nó là ca khác.
- Không ghi Brain.

Nhiệm vụ này thuần sinh file + thao tác git.

---

## VIỆC 1 — Sinh 35 file từ `schema_migrations`

### Lấy dữ liệu
Với mỗi version trong danh sách dưới, query qua Supabase MCP:

```sql
SELECT version, name, statements
FROM supabase_migrations.schema_migrations
WHERE version = '<version>';
```

Hoặc lấy một lần cả lô rồi tách ra.

### Ghi file
Đường dẫn: `supabase/migrations/<version>_<name>.sql`
Nội dung: nguyên văn `statements[1]`, thêm **đúng khối header này** lên đầu:

```sql
-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu <ngay trong version>.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
```

Ghi UTF-8 **không BOM** (nhiều statement có tiếng Việt có dấu; BOM sẽ làm psql lỗi ở dòng đầu).

### Danh sách 35 version

```
20260731111720  ops_guardian_stage3_2a_cron_scan_and_job_catalog
20260731225556  brain_decay_scoring_v1
20260803115424  add_embedding_tracking_columns_pms_brain
20260803115508  update_brain_embed_rpc_for_tracking_columns
20260803115814  create_embedding_health_views_pms_brain
20260803120707  brain_lint_findings_table
20260803120831  brain_lint_run_function
20260803120907  brain_lint_run_fix_variable_conflict
20260803125855  ops_tasks_trigger_sync_insert
20260804151053  brain_graph_v4_stage2_relations
20260804152602  brain_graph_v4_populate_relations_batch1
20260804163053  brain_graph_v4_populate_relations_calls_batch2
20260804163406  brain_graph_v4_populate_relations_triggered_by_batch3
20260804164450  brain_graph_v4_populate_relations_defined_in_batch4
20260804170026  brain_graph_v4_populate_relations_defined_in_batch4_fixed
20260805092733  brain_graph_v4_populate_relations_imports_batch5
20260805093947  brain_graph_v4_confirm_relations_imports_batch5
20260805094818  brain_graph_v4_add_decision_entity_type
20260805094911  brain_graph_v4_populate_relations_supersedes_batch6
20260805095422  brain_graph_v4_confirm_relations_supersedes_batch6
20260813064151  add_booking_arrival_check_cron
20260813070837  create_cancellation_sync_log
20260813073344  create_ingest_cancellation_log_rpc
20260813073402  create_check_arrival_email_processed_rpc
20260813082813  register_booking_extranet_review_reminder_job
20260813082939  add_booking_extranet_review_reminder_cron
20260814141401  stage3_fix_missing_rls_relation_evidence_state_events
20260814141409  stage3_fix_missing_rls_relation_evidence_state_events
20260817122204  get_suggested_price_read_from_brain
20260817122251  get_suggested_price_fix_numeric_cast
20260818155719  get_suggested_price_returns_net
20260821000452  breakfast_tracking
20260821001032  fix_breakfast_stay_day_boundary
20260821165806  create_inventory_management_tables
20260821165855  create_inventory_management_rpcs
```

### Ba ca lắt léo — đọc kỹ

**(a) `20260814141401` và `20260814141409` trùng tên nhau.** Đây là một lần retry: bản đầu mở bằng `BEGIN;`, bản sau bỏ đi. **Giữ đủ cả hai file**, tên file khác nhau nhờ version nên không đụng nhau. Không gộp, không bỏ bản nào — lịch sử đúng là đã chạy hai lần.

**(b) Ba migration `get_suggested_price` sửa chồng lên nhau** (`read_from_brain` → `fix_numeric_cast` → `returns_net`). Giữ **đủ cả ba**. Không gộp thành một file "bản cuối" — thứ tự áp dụng là một phần của lịch sử, và bản cuối chỉ đúng khi hai bản trước đã chạy.

**(c) Nếu bất kỳ version nào có `array_length(statements,1) > 1`:** nối các phần tử bằng một dòng trắng, giữ nguyên thứ tự, và **ghi rõ version nào rơi vào ca này trong báo cáo**. Kiểm tra trước bằng:
```sql
SELECT version, array_length(statements,1) AS n
FROM supabase_migrations.schema_migrations
WHERE version >= '20260731111720' AND array_length(statements,1) > 1;
```

---

## VIỆC 2 — Đổi tên file `20260811`

File `supabase/migrations/20260811_create_arrival_check_tables_and_ingest_rpc.sql` (5.932 bytes) mang version cụt 8 chữ số nên CLI không khớp được với bản remote `20260811115328` (statement 5.727 bytes) — cùng tên, cùng nội dung, chênh phần header.

**Đối chiếu trước khi đổi tên.** Dump statement remote ra file tạm, diff bỏ qua khoảng trắng:

```sql
SELECT statements[1] FROM supabase_migrations.schema_migrations
WHERE version = '20260811115328';
```

- Khớp về mặt nội dung (chỉ khác comment/whitespace) →
  ```powershell
  git mv supabase/migrations/20260811_create_arrival_check_tables_and_ingest_rpc.sql `
         supabase/migrations/20260811115328_create_arrival_check_tables_and_ingest_rpc.sql
  ```
- **Khác nhau về SQL thật sự → DỪNG, báo cáo, không đổi tên.** Nghĩa là file local chứa thứ chưa từng apply.

---

## VIỆC 3 — Xoá file `20260813` gộp

`supabase/migrations/20260813_cancellation_sync_and_brain_rpc_fix.sql` (4.132 bytes) là **một file gộp ba việc**, tương ứng ba migration đã apply riêng lẻ:

```
20260813070837  create_cancellation_sync_log             1.401
20260813073344  create_ingest_cancellation_log_rpc       1.657
20260813073402  create_check_arrival_email_processed_rpc   550
                                                  tổng = 3.608
```

**Chỉ xoá sau khi xác nhận** nội dung file local nằm trọn trong ba file vừa khôi phục ở Việc 1. Đối chiếu từng khối SQL, không chỉ so kích thước.

- Nằm trọn → `git rm supabase/migrations/20260813_cancellation_sync_and_brain_rpc_fix.sql`
- Có khối SQL nào **không** xuất hiện trong ba migration kia → **DỪNG, báo cáo**, giữ file lại. Đó là phần chưa từng apply.

---

## VIỆC 4 — Kiểm lại

```powershell
npx supabase@latest migration list
```

Kỳ vọng: mọi dòng đều có cả Local lẫn Remote, **trừ đúng một dòng** còn Local-only là `20260814120000` (stage 4 — ngoài phạm vi nhiệm vụ này).

Nếu còn dòng một cột nào khác → báo cáo, không tự xử.

Commit:
```powershell
git add -A
git commit -m "chore(migrations): khoi phuc 35 migration tu schema_migrations, chuan hoa version 20260811"
git push -u origin fix/restore-missing-migrations-20260904
```

Mở PR draft. **Không merge, không apply.**

---

## Báo cáo cuối

| Mục | Nội dung |
|---|---|
| Số file đã sinh | kỳ vọng 35 |
| Version có `n_stmt > 1` | liệt kê, hoặc "không có" |
| Việc 2 | đã đổi tên / dừng vì khác nội dung — kèm diff nếu dừng |
| Việc 3 | đã xoá / dừng vì có khối SQL lạ — kèm khối đó nếu dừng |
| `migration list` sau cùng | số dòng còn một cột và là dòng nào |
| PR | link |

Nếu bất kỳ việc nào phải dừng, **dừng cả chuỗi tại đó** và báo — đừng chạy tiếp các việc sau.
