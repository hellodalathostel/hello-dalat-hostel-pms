-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 03/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- Dời việc tạo ops_tasks vào thẳng trigger AFTER INSERT ON bookings, cùng transaction
-- với booking. Bỏ đường net.http_post fire-and-forget: booking commit xong bất kể
-- Edge Function trả gì, không có cách biết đã mất task cho tới khi lint_run() phát hiện
-- (9/123 booking từ 18/06 không có task nào — xem brain.decisions liên quan).
--
-- Bỏ mirror Notion theo yêu cầu (03/08/2026): trigger giờ CHỈ ghi ops_tasks.
-- Notion sync để làm sau, không giữ lại bất kỳ lời gọi webhook nào ở bước này.
--
-- task_date = check_in (theo brain.decisions "Task dọn phòng tạo tự động", 18/06/2026),
-- KHÔNG phải check_in - 1.

CREATE OR REPLACE FUNCTION public.call_ops_task_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Task Check-in/out — cùng ngày check-in
  INSERT INTO public.ops_tasks (task_name, task_date, loai, room_id, created_by)
  VALUES (
    'Check-in/out phòng ' || NEW.room_id,
    NEW.check_in,
    'Check-in/out',
    NEW.room_id,
    'trigger_bookings'
  );

  -- Task Dọn Phòng — cùng ngày check-in
  INSERT INTO public.ops_tasks (task_name, task_date, loai, room_id, created_by)
  VALUES (
    'Don phong ' || NEW.room_id,
    NEW.check_in,
    'Don Phong',
    NEW.room_id,
    'trigger_bookings'
  );

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.call_ops_task_creator() IS
  'AFTER INSERT ON public.bookings. Ghi 2 dòng ops_tasks (Check-in/out + Don Phong) đồng bộ,
   cùng transaction với booking — booking rollback thì task rollback theo, không còn khe hở
   im lặng như bản webhook cũ. KHÔNG mirror Notion (bỏ theo quyết định 03/08/2026) —
   sync Notion là việc riêng, làm sau. task_date = NEW.check_in, không phải check_in - 1.';

-- Migration rule (30/05/2026): mọi bảng public/brain đổi cấu trúc quan trọng phải kèm
-- GRANT + RLS. ops_tasks đã có RLS + policy authenticated từ trước — chỉ cần siết TRUNCATE
-- khỏi anon/authenticated, vì TRUNCATE không đi qua RLS policy (lỗ đã thấy lúc rà soát).
REVOKE TRUNCATE ON public.ops_tasks FROM anon, authenticated;