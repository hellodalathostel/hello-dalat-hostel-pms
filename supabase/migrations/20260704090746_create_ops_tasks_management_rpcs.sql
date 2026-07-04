-- Migration: create_ops_tasks_management_rpcs
-- Ngày: 2026-07-04
-- Mục đích: 3 RPC quản lý task cho Telegram bot (thay thế Notion task system)
-- task_number = ROW_NUMBER() tính dynamic theo created_at, KHÔNG lưu DB
-- LƯU Ý: bản gốc sort theo created_at ASC thuần. Đã được sửa lại ở migration
-- align_task_number_ordering_with_priority (cùng ngày) để thêm ưu tiên theo
-- priority trước — xem file 20260704091213_align_task_number_ordering_with_priority.sql

-- ============================================================
-- 1. complete_task_txn — đánh dấu Hoàn Thành
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
           ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
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
-- 2. skip_task_txn — bỏ qua task, ghi lý do vào ghi_chu
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
           ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
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
-- 3. extend_task_txn — dời task sang ngày khác (mặc định +1 ngày)
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
           ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
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

-- ============================================================
-- GRANT / REVOKE — theo Nguyên tắc #5 (explicit GRANT bắt buộc)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.complete_task_txn(date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_task_txn(date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_task_txn(date, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.skip_task_txn(date, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.skip_task_txn(date, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.skip_task_txn(date, integer, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.extend_task_txn(date, integer, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.extend_task_txn(date, integer, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.extend_task_txn(date, integer, date) TO authenticated, service_role;
