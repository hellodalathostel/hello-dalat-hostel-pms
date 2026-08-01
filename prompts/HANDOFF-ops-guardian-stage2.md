# Handoff — đồng bộ Ops Guardian Stage 2 về repo local

**Ngày:** 31/07/2026
**Repo:** `D:\hello-dalat-hostel-pms`
**Trạng thái remote:** đã live. Việc dưới đây CHỈ là đồng bộ file + commit, **không deploy lại gì cả**.

---

## Bối cảnh (đọc trước khi làm)

Cả 2 thay đổi đã có trên production rồi:

| Thứ | Trạng thái remote |
|---|---|
| Migration `20260731064742_ops_guardian_stage2_peer_check_and_task_list` | Đã apply qua Supabase MCP, đã có trong `supabase_migrations.schema_migrations` |
| Edge Function `task-reminder` | Đã deploy **v40**, đang chạy, đã verify |

Nếu file không được đưa về repo, lần deploy CLI kế tiếp sẽ **ghi đè v40 bằng bản v39 cũ trong repo** — đúng cách bug Notion đã phát sinh hôm 30/07.

---

## Việc cần làm

### 1. Copy 3 file vào đúng vị trí

```
supabase/migrations/20260731064742_ops_guardian_stage2_peer_check_and_task_list.sql
supabase/functions/task-reminder/index.ts        <- GHI ĐÈ file cũ (bản Notion)
supabase/functions/task-reminder/deno.json       <- ghi đè, nội dung nhiều khả năng đã giống
```

> ⚠️ `index.ts` cũ trong repo là bản query Notion + ghi `telegram_task_sessions` (bảng đã drop). Ghi đè hoàn toàn, **không merge**.

### 2. Verify migration history khớp 1:1

```powershell
cd D:\hello-dalat-hostel-pms
supabase migration list
```

Kỳ vọng: dòng `20260731064742` hiện ở **cả cột Local lẫn Remote**. Không chạy `supabase db push` — version này đã có trong `schema_migrations` nên push sẽ bỏ qua, nhưng cứ kiểm tra `migration list` cho chắc.

**Tuyệt đối không chạy `supabase migration repair --status reverted`** cho version này.

### 3. Kiểm tra file khác không còn tham chiếu bảng đã drop

```powershell
Select-String -Path .\supabase -Pattern "telegram_task_sessions" -Recurse
Select-String -Path .\supabase\functions -Pattern "NOTION_TASK_DB_ID" -Recurse
```

Nếu còn hit ngoài `task-reminder` (nhất là trong `telegram-webhook`) → **báo lại, đừng tự sửa**. Đây là nghi vấn regression thứ hai chưa được xác minh.

### 4. Commit

Hai commit riêng, Conventional Commits, một fix/feat mỗi commit:

```powershell
git add supabase/functions/task-reminder/index.ts supabase/functions/task-reminder/deno.json
git commit -m "fix(task-reminder): doc task tu ops_tasks thay vi Notion da bo"

git add supabase/migrations/20260731064742_ops_guardian_stage2_peer_check_and_task_list.sql
git commit -m "feat(ops-guardian): stage 2 canh cheo hai chieu + list_tasks_for_date"
```

---

## Những gì KHÔNG được làm

- ❌ Không `supabase functions deploy task-reminder` — v40 đang chạy đúng, deploy lại chỉ tăng version vô ích
- ❌ Không chạy lại file SQL migration lên remote
- ❌ Không sửa nội dung file SQL — version và nội dung phải khớp đúng thứ đã apply
- ❌ Không đụng `automation.job_registry` (ngưỡng đã khôi phục về 6h/1h sau khi test)

---

## Nội dung Stage 2 (tham khảo)

3 object DB mới:

| Object | Vai trò |
|---|---|
| `automation.peer_check(text)` | Kiểm tra 1 job theo ngưỡng lấy từ `job_registry`, ghi alert idempotent |
| `public.check_peer_job(text)` | Wrapper PostgREST (schema `automation` không được expose) |
| `public.list_tasks_for_date(date)` | Nguồn đánh số task duy nhất, khớp `complete/skip/extend_task_txn` |

Cơ chế canh chéo: `task-reminder` (07:30 ICT) kiểm tra ngược `ops-guardian`; `ops-guardian` (mỗi 6h) kiểm tra `task-reminder` qua `job_registry`. Không bên nào là điểm chết đơn lẻ.

Lỗ hổng còn lại đã thừa nhận: cả hai chết cùng lúc thì vẫn im lặng — để Stage 3.
