# TASK: Kéo 6 migration từ Supabase remote về repo

## Bối cảnh
6 migration đã được apply trực tiếp lên Supabase remote (project `rcfhhgywjdwqcgnpkbtl`)
qua MCP trong session trước, nhưng CHƯA có file tương ứng trong `supabase/migrations/`.
Cần đồng bộ để repo không lệch khỏi remote.

Danh sách 6 migration (theo thứ tự apply):
1. extend_bank_statements_for_reconciliation
2. add_bank_txn_kind_ca_nhan_and_the_mpos
3. create_bank_accounts_and_opening_balance
4. create_bank_book_views
5. create_bank_reconciliation_view
6. add_mbbank_account_639679639679

## Bước 1 — Kiểm tra tình trạng lệch (BẮT BUỘC làm trước)

```bash
cd D:\hello-dalat-hostel-pms
supabase migration list
```

Output sẽ có 3 cột: `Local | Remote | Time`.
- Dòng nào có Remote nhưng Local trống → migration cần kéo về.
- **Dừng lại và báo cáo output cho tôi** nếu:
  - Số dòng lệch KHÁC 6
  - Có dòng nào Local có nhưng Remote trống (nghĩa là migration local chưa push — tình huống khác, đừng tự xử lý)

## Bước 2 — Kéo về

```bash
supabase db pull
```

Lệnh này tạo 1 file migration mới gộp toàn bộ diff giữa local schema và remote.

**Lưu ý:** nếu `db pull` tạo ra 1 file duy nhất chứa cả 6 thay đổi thay vì 6 file riêng,
đó là hành vi bình thường — chấp nhận, không cố tách tay.

Nếu `db pull` báo lỗi hoặc yêu cầu link project:
```bash
supabase link --project-ref rcfhhgywjdwqcgnpkbtl
```
rồi chạy lại.

## Bước 3 — Review file vừa sinh

Mở file mới trong `supabase/migrations/` và kiểm tra 5 điểm sau. Báo cáo cho tôi
nếu thấy BẤT KỲ điểm nào không đạt — KHÔNG tự sửa file:

1. **Schema `brain`**: các thay đổi trên `brain.bank_statements` có mặt đầy đủ
   (cột `txn_kind`, `counterpart_account`, `wallet`, `is_opening_history`, `opening_at`,
   các CHECK constraint).
2. **Bảng `public.bank_accounts`**: có `CREATE TABLE` + `ENABLE ROW LEVEL SECURITY`
   + GRANT explicit cho `anon`/`authenticated`/`service_role`.
3. **4 view** đều có `WITH (security_invoker = true)`:
   `bank_book_detail`, `bank_book_daily`, `bank_reconciliation`, `bank_mpos_reconciliation`.
   ⚠️ Đây là điểm hay bị mất khi pull — nếu thiếu, BÁO NGAY.
4. **Không có drift lạ**: file không chứa thay đổi nào ngoài phạm vi 6 migration trên
   (ví dụ: bỗng dưng DROP một bảng/policy không liên quan). Nếu có → báo cáo, dừng.
5. **Constraint 2 chỗ**: cả `bank_statements_account_check` và
   `bank_statements_kind_detail_check` đều đã bao gồm TK MB `639679639679`.

## Bước 4 — Xác minh không còn lệch

```bash
supabase migration list
```
Local và Remote phải khớp hoàn toàn.

## Bước 5 — Commit

Chỉ commit sau khi Bước 3 và 4 đều sạch.

```bash
git add supabase/migrations/
git commit -m "chore(db): sync 6 bank book migrations from remote

- extend brain.bank_statements for reconciliation (txn_kind, opening flags)
- add txn_kind values: ca_nhan, thu_the_mpos
- create public.bank_accounts + opening balance
- create bank book views (detail, daily)
- create reconciliation views (bank, mpos)
- add MB Bank account 639679639679"
```

**KHÔNG push.** Dừng lại và báo cáo:
- Tên file migration vừa sinh
- Kết quả 5 điểm review ở Bước 3
- Output `supabase migration list` sau khi pull

## Ràng buộc
- KHÔNG chạy `supabase db push`, `db reset`, hay bất kỳ lệnh nào ghi lên remote.
- KHÔNG sửa nội dung file migration vừa pull — chỉ review và báo cáo.
- Nếu gặp lỗi không nằm trong hướng dẫn, dừng và báo cáo nguyên văn lỗi.