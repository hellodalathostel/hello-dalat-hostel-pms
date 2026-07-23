# TASK — Verify & commit 10 migration bank book

Lead Dev đã lấy nội dung SQL nguyên văn từ `supabase_migrations.schema_migrations`
trên remote và Hiếu đã giải nén 10 file vào `supabase/migrations/`.

## Bước 1 — Xác nhận file đã có

```bash
cd D:\hello-dalat-hostel-pms
git status --short supabase/migrations/
```

Phải thấy đúng 10 file untracked:

20260721164055_extend_bank_statements_for_reconciliation.sql
20260721170019_add_bank_txn_kind_ca_nhan_and_the_mpos.sql
20260721170921_create_bank_accounts_and_opening_balance.sql
20260721170951_create_bank_book_views.sql
20260721171024_create_bank_reconciliation_view.sql
20260721171131_fix_bank_reconciliation_exclude_future_records.sql
20260721171239_fix_bank_reconciliation_symmetric_window.sql
20260721171333_fix_bank_reconciliation_use_latest_opening.sql
20260721171420_fix_bank_reconciliation_exclude_opening_matched_pms.sql
20260721180747_add_mbbank_account_639679639679.sql


Thiếu/thừa file nào → dừng, báo cáo.

## Bước 2 — Verify nội dung (chỉ đọc, KHÔNG sửa)

Báo cáo PASS/FAIL từng điểm:

1. `20260721164055`: `brain.bank_statements` có đủ cột mới `direction`,
   `balance_after`, `status`, `txn_kind`, `account_no`, `counterpart_account`,
   `wallet`, `note`, `approved_at`.
2. `20260721170921`: `public.bank_accounts` có `ENABLE ROW LEVEL SECURITY`
   + `GRANT SELECT ... TO anon, authenticated` + `GRANT ALL ... TO service_role`
   + policy `bank_accounts_select`.
3. Cả 4 view có `WITH (security_invoker = true)`:
   - `bank_book_detail`, `bank_book_daily` → file `20260721170951`
   - `bank_reconciliation`, `bank_mpos_reconciliation` → file `20260721171024`
   - và `bank_reconciliation` được CREATE OR REPLACE lại ở 3 file fix
     (`171131`, `171239`, `171333`, `171420`) — mỗi lần đều phải có
     `security_invoker = true`. Kiểm tra TẤT CẢ.
4. `20260721180747`: sửa **cả hai** constraint
   `bank_statements_account_check` VÀ `bank_statements_kind_detail_check`,
   cả hai đều chứa `'639679639679'`.
5. Không file nào có `DROP TABLE`, `DROP SCHEMA`, hay statement ngoài phạm vi bank book.

Gợi ý lệnh grep nhanh:
```bash
grep -c "security_invoker = true" supabase/migrations/202607211*.sql
grep -l "639679639679" supabase/migrations/20260721180747*.sql
```

## Bước 3 — KHÔNG chạy `supabase migration list`

Lệnh này sẽ vẫn báo lệch vì Cụm A (102 migration pre-baseline) — đó là hành vi
đã biết và chấp nhận, không phải lỗi. Đừng dùng nó làm tiêu chí pass/fail.

## Bước 4 — Commit (chỉ khi Bước 2 toàn PASS)

```bash
git add supabase/migrations/20260721*.sql
git commit -m "chore(db): sync 10 bank book migrations from remote

- extend brain.bank_statements for reconciliation (txn_kind, direction, balance_after)
- add txn_kind values: ca_nhan, thu_the_mpos
- create public.bank_accounts + opening balance (VCB x2)
- create bank book views (detail, daily)
- create bank/mpos reconciliation views + 4 fixes
- add MB Bank account 639679639679

Content pulled verbatim from supabase_migrations.schema_migrations.
Cum A (102 pre-baseline migrations) remains remote-only by design (see 6e6d423)."
```

**KHÔNG push.** Báo cáo lại: kết quả 5 điểm Bước 2 + commit hash.

## Ràng buộc
- KHÔNG `db push`, `db pull`, `db reset`, `migration repair`.
- KHÔNG sửa nội dung file.
- Gặp lỗi ngoài hướng dẫn → dừng, báo nguyên văn.