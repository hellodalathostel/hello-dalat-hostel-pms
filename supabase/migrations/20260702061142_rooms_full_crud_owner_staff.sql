-- Backlog #6 (audit 2026-06-26): rooms UPDATE thực tế đã mở cho mọi authenticated
-- (do policy rooms_authenticated_update_housekeeping USING true / CHECK true OR với owner_write).
-- Quyết định 2026-07-02: khớp nguyên tắc chung #3 (Owner+Staff full CRUD hầu hết bảng nghiệp vụ),
-- bỏ owner_write (vốn chỉ còn hiệu lực thật cho INSERT/DELETE, gây lệch giữa comment code và DB thật).
-- Gộp INSERT/UPDATE/DELETE vào 1 policy chung cho authenticated, đơn giản hóa.

DROP POLICY IF EXISTS owner_write ON public.rooms;
DROP POLICY IF EXISTS rooms_authenticated_update_housekeeping ON public.rooms;

CREATE POLICY authenticated_write_rooms
  ON public.rooms
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
