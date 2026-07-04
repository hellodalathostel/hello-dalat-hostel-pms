-- Migration: align_task_number_ordering_with_priority
-- Ngày: 2026-07-04
-- Bối cảnh (brain.decisions "Align task_number ordering giua task-reminder va RPC quan ly task"):
--   task-reminder (hiển thị số cho Lợi qua Telegram) sort theo priority trước
--   (Khẩn lên đầu), nhưng 3 RPC complete/skip/extend_task_txn ban đầu chỉ sort
--   theo created_at ASC thuần. Nếu trong ngày có nhiều priority khác nhau, số
--   Lợi thấy trên Telegram sẽ lệch với số RPC hiểu -> nguy cơ complete/skip
--   nhầm task.
-- Quyết định: sửa 3 RPC dùng CASE priority (Khan=0, Cao=1, Binh Thuong=2,
--   Thap=3) rồi created_at ASC làm tie-break, để khớp với hành vi hiển thị
--   task-reminder đã quen thuộc với Lợi từ thời Notion.

-- ============================================================
-- 1. complete_task_txn — thêm ưu tiên theo priority
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_task_txn(p_task_date date, p_task_number integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_task_id bigint;
  v_task_name text;
BEGIN
  SELECT id, task_name INTO v_task_id, v_task_name
  FROM (
    SELECT id, task_name,
           ROW_NUMBER() OVER (
             ORDER BY
               CASE priority
                 WHEN 'Khan' THEN 0
                 WHEN 'Cao' THEN 1
                 WHEN 'Binh Thuong' THEN 2
                 WHEN 'Thap' THEN 3
                 ELSE 2
               END,
               created_at ASC
           ) AS rn
    FROM public.ops_tasks
    WHERE task_date = p_task_date
      AND status = 'Can Lam'
  ) numbered
  WHERE rn = p_task_number;

  IF v_task_id IS NULL THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND' USING HINT = 'Khong tim thay task so nay trong danh sach Can Lam hom do';
  END IF;

  UPDATE public.ops_tasks
  SET status = 'Hoan Thanh',
      updated_at = now()
  WHERE id = v_task_id;

  RETURN json_build_object(
    'id', v_task_id,
    'task_name', v_task_name,
    'status', 'Hoan Thanh'
  );
END;
$function$;

-- ============================================================
-- 2. skip_task_txn — thêm ưu tiên theo priority
-- ============================================================
CREATE OR REPLACE FUNCTION public.skip_task_txn(p_task_date date, p_task_number integer, p_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_task_id bigint;
  v_task_name text;
BEGIN
  SELECT id, task_name INTO v_task_id, v_task_name
  FROM (
    SELECT id, task_name,
           ROW_NUMBER() OVER (
             ORDER BY
               CASE priority
                 WHEN 'Khan' THEN 0
                 WHEN 'Cao' THEN 1
                 WHEN 'Binh Thuong' THEN 2
                 WHEN 'Thap' THEN 3
                 ELSE 2
               END,
               created_at ASC
           ) AS rn
    FROM public.ops_tasks
    WHERE task_date = p_task_date
      AND status = 'Can Lam'
  ) numbered
  WHERE rn = p_task_number;

  IF v_task_id IS NULL THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND' USING HINT = 'Khong tim thay task so nay trong danh sach Can Lam hom do';
  END IF;

  UPDATE public.ops_tasks
  SET status = 'Bo Qua',
      ghi_chu = CASE
        WHEN p_reason IS NOT NULL AND ghi_chu IS NOT NULL THEN ghi_chu || ' | Bo qua: ' || p_reason
        WHEN p_reason IS NOT NULL THEN 'Bo qua: ' || p_reason
        ELSE ghi_chu
      END,
      updated_at = now()
  WHERE id = v_task_id;

  RETURN json_build_object(
    'id', v_task_id,
    'task_name', v_task_name,
    'status', 'Bo Qua'
  );
END;
$function$;

-- ============================================================
-- 3. extend_task_txn — thêm ưu tiên theo priority
-- ============================================================
CREATE OR REPLACE FUNCTION public.extend_task_txn(p_task_date date, p_task_number integer, p_new_date date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_task_id bigint;
  v_task_name text;
  v_target_date date;
BEGIN
  v_target_date := COALESCE(p_new_date, p_task_date + 1);

  SELECT id, task_name INTO v_task_id, v_task_name
  FROM (
    SELECT id, task_name,
           ROW_NUMBER() OVER (
             ORDER BY
               CASE priority
                 WHEN 'Khan' THEN 0
                 WHEN 'Cao' THEN 1
                 WHEN 'Binh Thuong' THEN 2
                 WHEN 'Thap' THEN 3
                 ELSE 2
               END,
               created_at ASC
           ) AS rn
    FROM public.ops_tasks
    WHERE task_date = p_task_date
      AND status = 'Can Lam'
  ) numbered
  WHERE rn = p_task_number;

  IF v_task_id IS NULL THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND' USING HINT = 'Khong tim thay task so nay trong danh sach Can Lam hom do';
  END IF;

  UPDATE public.ops_tasks
  SET task_date = v_target_date,
      updated_at = now()
  WHERE id = v_task_id;

  RETURN json_build_object(
    'id', v_task_id,
    'task_name', v_task_name,
    'new_task_date', v_target_date
  );
END;
$function$;

-- GRANT/REVOKE không đổi so với migration trước (CREATE OR REPLACE giữ nguyên
-- quyền hiện có), không cần lặp lại ở đây.
