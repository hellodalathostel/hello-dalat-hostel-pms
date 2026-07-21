-- Security fix 2026-07-02: 4 RPC mới apply hôm nay thiếu REVOKE PUBLIC/anon
-- (khác với mark_room_clean_txn và các RPC cũ luôn có REVOKE + GRANT explicit).
-- Postgres mặc định EXECUTE cho PUBLIC, anon kế thừa PUBLIC -> unauthenticated
-- có thể gọi reject booking request / tạo-sửa-ẩn phòng mà không cần login.
-- Phát hiện bởi Claude Code CLI review, 2026-07-02.

REVOKE EXECUTE ON FUNCTION public.reject_booking_request_txn(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_booking_request_txn(uuid, text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_room_txn(text, text, text, integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_room_txn(text, text, text, integer, integer, integer) FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_room_txn(text, text, text, integer, integer, integer, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_room_txn(text, text, text, integer, integer, integer, boolean) FROM anon;

REVOKE EXECUTE ON FUNCTION public.toggle_room_active_txn(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_room_active_txn(text, boolean) FROM anon;
