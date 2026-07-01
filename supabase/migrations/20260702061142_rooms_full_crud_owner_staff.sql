-- Backlog #6 (audit 2026-06-26): rooms UPDATE thực tế đã mở cho mọi authenticated
-- (do policy rooms_authenticated_update_housekeeping USING true / CHECK true OR với owner_write).
-- Quyết định 2026-07-02 (Claude.ai Lead Developer): khớp nguyên tắc chung #3 (Owner+Staff full
-- CRUD hầu hết bảng nghiệp vụ), bỏ owner_write. Gộp INSERT/UPDATE/DELETE vào 1 policy chung cho
-- authenticated. Việc validate chi tiết chuyển vào các RPC *_txn (xem migration
-- 20260702061258_add_room_mutation_txns.sql).
DROP POLICY IF EXISTS owner_write ON public.rooms;
DROP POLICY IF EXISTS rooms_authenticated_update_housekeeping ON public.rooms;

CREATE POLICY authenticated_write_rooms
  ON public.rooms
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
