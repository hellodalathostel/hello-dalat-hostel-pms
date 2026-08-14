# SPEC — Brain Graph V4 Stage 4: graph_snapshots + currency views
Ngày: 2026-08-14 · Project: PMS (Brain Graph V4)

## Mục tiêu
Hoàn thiện currency semantics đã chốt 22/07: thêm bảng `brain.graph_snapshots`
+ `brain.entity_observations`, cùng 3 view `effective_relations`,
`current_relation_evidence`, `current_entity_observations`, để hệ thống có
khái niệm "hiện hành" thay vì mọi relation/entity coi như mãi mãi đúng.

## Định nghĩa "xong"
- [ ] Migration Stage 4 apply thành công trên production (`rcfhhgywjdwqcgnpkbtl`),
      dry-run BEGIN...ROLLBACK trước như Stage 3.
- [ ] `brain.graph_snapshots` có cột `repository` và `scope_id` là 2 cột **riêng
      biệt** (không gộp).
- [ ] `relation_evidence.snapshot_id` được thêm FK thật tới `graph_snapshots.id`
      (hiện đang để trống theo ghi chú Stage 3).
- [ ] `brain.entity_observations`: mỗi lần ghi observation mới cho 1
      `(entity_id, scope_id)` trong 1 snapshot → xoá sạch observation cũ của
      đúng cặp đó thuộc snapshot trước, rồi insert lại full (full-replace,
      không merge từng key).
- [ ] Test end-to-end thật: insert 1 snapshot `is_complete=true` + `full` +
      `applied`, gắn evidence/observation vào, verify `effective_relations`
      và `current_entity_observations` trả đúng tập kỳ vọng.
- [ ] Test riêng edge case #1: snapshot `is_complete=false` hoặc
      `applied_with_errors` KHÔNG được trở thành "latest" trong view — verify
      bằng query trực tiếp, không suy luận.
- [ ] Test riêng edge case #2: 2 snapshot cùng `repository+scope_id`, "latest"
      xác định bằng cột nào (chốt ở bước triển khai, khả năng cao là
      `applied_at` + tie-break `id`) — verify thứ tự đúng khi 2 giá trị gần nhau.
- [ ] Dọn sạch dữ liệu test trước khi coi là xong (giống kỷ luật Stage 3).
- [ ] Ghi `brain.decisions` (tag `stage4`) + `brain.daily_log` category `dev`
      sau khi verify, đọc lại xác nhận.

## Ngoài phạm vi
- KHÔNG viết scanner/importer thật (git scan, AST) để tự động tạo snapshot —
  Stage 4 chỉ có schema + RPC ghi snapshot thủ công/test.
- KHÔNG backfill `entity_observations` cho 282 entities hiện có.
- KHÔNG làm KL2 (persistent evidence giữ edge sống qua nhiều snapshot cũ) —
  hoãn theo decision 22/07, mở khi graph chạy vài tháng thấy phiền thật.
- KHÔNG thêm `scope_id`/`repository` vào bảng `entities` — 2 cột này chỉ sống
  trên `graph_snapshots` (và kế thừa qua `entity_observations`).
- KHÔNG xử lý case relation bắc cầu 2 scope khác nhau (edge case #3) — xác
  nhận mới là lý thuyết, chưa có case thật. Nếu view gặp phải, tạm để hành vi
  tự nhiên của logic hiện tại (không viết nhánh xử lý riêng), ghi lại làm known
  limitation nếu phát sinh.

## Thay đổi dữ liệu
- Bảng mới: `brain.graph_snapshots` (`id`, `scan_id`, `manifest_hash` UNIQUE,
  `repository`, `scope_id`, `snapshot_mode` CHECK (`full`/`delta`),
  `status` CHECK (`applied`/`applied_with_errors`/...), `is_complete` bool,
  `applied_at`, `created_at`).
- Bảng mới: `brain.entity_observations` (`id`, `entity_id` FK → `entities.id`,
  `snapshot_id` FK → `graph_snapshots.id`, `scope_id`, `metadata` jsonb,
  `created_at`).
- Sửa bảng có sẵn: `brain.relation_evidence.snapshot_id` — thêm FK constraint
  thật tới `graph_snapshots.id` (cột đã tồn tại, chỉ thêm ràng buộc).
- View mới: `brain.current_relation_evidence`, `brain.effective_relations`,
  `brain.current_entity_observations` — theo định nghĩa currency 22/07.
- Có migration. GRANT + RLS bắt buộc append theo migration rule (30/05/2026).

## Các bước triển khai
1. Viết migration SQL: 2 bảng mới + FK + CHECK constraints + GRANT + RLS.
2. Viết 3 view theo logic currency đã chốt.
3. Dry-run BEGIN...ROLLBACK trên production, review kết quả.
4. Apply thật.
5. Insert snapshot test + evidence/observation test, verify view trả đúng.
6. Test riêng 2 edge case #1 và #2 bằng dữ liệu test cụ thể.
7. Dọn sạch dữ liệu test.
8. Ghi `brain.decisions` + `brain.daily_log`, verify đọc lại.

## Edge case phải xử lý
- Snapshot không complete/có lỗi không được là "latest" (chặn trong view, có test riêng).
- Race giữa 2 snapshot cùng repository+scope_id — cần "latest" tie-break rõ ràng.
- (Đã xác nhận chỉ lý thuyết, không cần xử lý riêng) Relation bắc cầu 2 scope khác nhau.

## Rollback
Migration chỉ thêm bảng/view mới + 1 FK constraint trên cột đã tồn tại
(`relation_evidence.snapshot_id`, hiện `NULL`-able, chưa có dữ liệu nên FK an
toàn). Rollback = drop 3 view + drop FK + drop 2 bảng mới. Không đụng
`entities`/`relations`/`relation_evidence` (trừ thêm FK)/`relation_state_events`
đã có — 282 entities/316 relations gốc không đổi.
