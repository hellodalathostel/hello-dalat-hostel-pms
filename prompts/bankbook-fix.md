markdown
# TASK (tiếp) — Kéo migration bank book về repo

## Xác nhận từ Lead Dev
Đã query trực tiếp `supabase_migrations.schema_migrations` trên remote.
Kết quả: **toàn bộ 10 migration trong Cụm B đều thuộc bank book**, không có
migration lạ nào lẫn vào. File mô tả trước đếm 6 theo nhóm logic; thực tế 10 file
vì reconciliation view được fix 4 lần riêng biệt.

Danh sách chính thức (đã verify remote):

20260721164055 extend_bank_statements_for_reconciliation
20260721170019 add_bank_txn_kind_ca_nhan_and_the_mpos
20260721170921 create_bank_accounts_and_opening_balance
20260721170951 create_bank_book_views
20260721171024 create_bank_reconciliation_view
20260721171131 fix_bank_reconciliation_exclude_future_records
20260721171239 fix_bank_reconciliation_symmetric_window
20260721171333 fix_bank_reconciliation_use_latest_opening
20260721171420 fix_bank_reconciliation_exclude_opening_matched_pms
20260721180747 add_mbbank_account_639679639679
**Cụm A (102 migration cũ, 2026-04-20 → 2026-06-17): BỎ QUA hoàn toàn.**
Đó là hệ quả của baseline `6e6d423` — remote giữ record lịch sử, local đã archive.
Đúng thiết kế, không phải drift. Không đụng vào.

## ⚠️ Vấn đề với `supabase db pull`

`db pull` gộp toàn bộ diff local↔remote vào 1 file — nghĩa là nó sẽ kéo về
**cả Cụm A (102 migration cũ)** lẫn Cụm B. Đó là kết quả KHÔNG mong muốn.

→ **KHÔNG chạy `supabase db pull` trần.**

## Cách làm: tạo file migration thủ công theo nội dung remote

### Bước 1 — Lấy nội dung SQL gốc của 10 migration

```bash
cd D:\hello-dalat-hostel-pms
```

Chạy lệnh sau để dump statements của từng migration từ remote:

```bash
supabase db pull --schema brain,public bank_book_sync
```

Nếu lệnh trên vẫn kéo cả Cụm A → **hủy, xóa file vừa sinh, chuyển sang Bước 1b.**

### Bước 1b — Fallback: tạo file rỗng có tên đúng, lấy nội dung từ Lead Dev

Nếu Bước 1 không lọc được, dừng lại và báo cáo cho tôi. Tôi sẽ query
`supabase_migrations.schema_migrations.statements` trên remote và gửi lại
nội dung SQL đầy đủ của từng migration để bạn tạo file thủ công.

**Đây là hướng an toàn nhất — đừng ngại chọn nó.**

### Bước 2 — Đặt tên file (khi đã có nội dung)

Tạo đúng 10 file trong `supabase/migrations/`, tên theo format:
`<version>_<name>.sql`

Ví dụ: `20260721164055_extend_bank_statements_for_reconciliation.sql`

Tên file PHẢI khớp chính xác version + name ở danh sách trên, nếu không
`supabase migration list` sẽ vẫn báo lệch.

### Bước 3 — Verify

```bash
supabase migration list
```

Cụm B phải khớp hoàn toàn Local ↔ Remote.
Cụm A vẫn lệch — **đó là bình thường, chấp nhận.**

### Bước 4 — Review nội dung (báo cáo, KHÔNG tự sửa)

Kiểm tra 5 điểm, báo cáo nếu điểm nào không đạt:

1. `brain.bank_statements` có đủ cột mới: `txn_kind`, `counterpart_account`,
   `wallet`, `is_opening_history`, `opening_at`, cùng các CHECK constraint.
2. `public.bank_accounts`: `CREATE TABLE` + `ENABLE ROW LEVEL SECURITY`
   + GRANT explicit cho `anon` / `authenticated` / `service_role`.
3. Cả 4 view có `WITH (security_invoker = true)`:
   `bank_book_detail`, `bank_book_daily`, `bank_reconciliation`,
   `bank_mpos_reconciliation`.
   ⚠️ Điểm hay bị mất nhất — nếu thiếu, BÁO NGAY.
4. Migration `add_mbbank_account_639679639679` sửa **CẢ HAI** constraint:
   `bank_statements_account_check` VÀ `bank_statements_kind_detail_check`.
5. Không có statement nào ngoài phạm vi bank book (không DROP bảng/policy lạ).

### Bước 5 — Commit (chỉ khi Bước 3 + 4 sạch)

```bash
git add supabase/migrations/
git commit -m "chore(db): sync 10 bank book migrations from remote

- extend brain.bank_statements for reconciliation
- add txn_kind values: ca_nhan, thu_the_mpos
- create public.bank_accounts + opening balance
- create bank book views (detail, daily)
- create bank reconciliation view + 4 fixes
- add MB Bank account 639679639679

Cum A (102 pre-baseline migrations) remains remote-only by design (see 6e6d423)."
```

**KHÔNG push.**

## Báo cáo lại cho tôi
- Bước 1 có lọc được schema không, hay phải dùng fallback 1b
- Output `supabase migration list` sau khi tạo file
- Kết quả 5 điểm review Bước 4

## Ràng buộc
- KHÔNG `db push`, `db reset`, hay bất kỳ lệnh ghi lên remote.
- KHÔNG đụng vào Cụm A.
- KHÔNG sửa nội dung SQL — chỉ tạo file, review, báo cáo.
- Gặp lỗi ngoài hướng dẫn → dừng, báo nguyên văn.