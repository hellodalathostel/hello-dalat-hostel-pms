# COMMIT: PII fix (đã deploy production, chưa commit Git)

## Bối cảnh
2 file đã sửa và deploy production từ đầu session (fix PII logging — Critical finding #1
từ Codex review) nhưng chưa commit vào Git. Cần commit riêng, KHÔNG gộp với 2 file backfill
migration (đã commit ở hash `84ba4c27cb441a9dac4ac6c9bfb7d9f758ffcd35`) vì đây là 2 việc
khác nhau về mục đích (bug fix vs schema documentation).

Lưu ý: file thứ 3 trong scope ban đầu (`src/hooks/useCheckIn.ts` — dead code duplicate)
đã bị XÓA, không phải sửa — git sẽ track đây là deletion.

## Lệnh cần chạy

```bash
git status
git add src/features/checkin/hooks/useCheckIn.ts
git add supabase/functions/checkin-processor/index.ts
git add src/hooks/useCheckIn.ts
git status
```

Nếu `git status` ở bước cuối cho thấy đúng 3 file này đang staged (2 modified + 1 deleted),
tiếp tục commit:

```bash
git commit -m "fix: remove PII logging in check-in flow

- useCheckIn.ts: log metadata only (booking_id, guests_count) instead of
  full guests payload (document_number, full_name, date_of_birth)
- checkin-processor/index.ts: remove text_preview/raw_preview from Gemini
  OCR debug logs and HTTP error response body — these contained extracted
  CCCD/Passport data (PII), contrary to the original comment claiming
  raw output was schema-only
- Remove dead duplicate src/hooks/useCheckIn.ts (unused, confirmed via grep
  — only src/features/checkin/hooks/useCheckIn.ts is imported by
  CheckInModal.tsx)

Deployed to production (checkin-processor Edge Function) prior to this
commit — this commit brings Git history in sync with deployed state."
```

Nếu `git status` cho thấy file khác cũng đang ở trạng thái thay đổi (không phải 3 file
trên) → DỪNG LẠI, báo cáo danh sách đầy đủ cho Claude.ai, KHÔNG tự `git add .` hay gộp
thêm file lạ vào commit này.

## KHÔNG push
Chỉ commit local, giống như 2 file backfill trước. Chờ Hiếu xác nhận push tất cả cùng lúc.

## Báo cáo lại
1. Output `git status` (cả 2 lần — trước và sau khi add).
2. Output `git commit`.
3. Commit hash mới.
4. Tổng số commit hiện tại đang ahead `origin/main` (chạy `git log origin/main..HEAD
   --oneline` để biết).