-- Legacy field từ thời Firebase, đã confirm 0 dữ liệu thật,
-- không còn code nào reference. Đã apply qua MCP ngày 2026-06-22.
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_firebase_uid_key;
ALTER TABLE public.app_users DROP COLUMN IF EXISTS firebase_uid;
