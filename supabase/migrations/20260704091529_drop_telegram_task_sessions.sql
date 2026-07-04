-- Migration: drop_telegram_task_sessions
-- Ngày: 2026-07-04
-- Lý do: Task System Migration hoàn tất — task_number hiển thị cho Lợi qua
-- Telegram giờ tính dynamic bằng ROW_NUMBER() trực tiếp trên public.ops_tasks
-- (filter theo task_date + status='Can Lam', sort theo priority + created_at).
-- Không còn cần lưu session riêng theo ngày như thời Notion
-- (telegram_task_sessions: id, session_date, task_index, notion_page_id,
-- task_name, created_at). Xóa hẳn để tránh dữ liệu mồ côi và nhầm lẫn.

DROP TABLE IF EXISTS public.telegram_task_sessions;
