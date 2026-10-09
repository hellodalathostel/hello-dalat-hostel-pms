-- Migration: create_ops_tasks_management_rpcs
-- Muc dich: RPC de Telegram bot (qua service_role) hoac frontend (qua authenticated)
-- quan ly ops_tasks ma khong update thang DB, tranh transition khong hop le.
-- Sort/danh so: task_number tinh dynamic theo created_at ASC trong pham vi
-- (task_date, status = 'Can Lam') - khong luu vao DB.

-- ============================================
-- 1. complete_task_txn
-- ============================================
CREATE OR REPLACE FUNCTION public.complete_task_txn(
  p_task_date date,
  p_task_number integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.complete_task_txn(date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_task_txn(date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_task_txn(date, integer) TO authenticated, service_role;

-- ============================================
-- 2. skip_task_txn
-- ============================================
CREATE OR REPLACE FUNCTION public.skip_task_txn(
  p_task_date date,
  p_task_number integer,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.skip_task_txn(date, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.skip_task_txn(date, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.skip_task_txn(date, integer, text) TO authenticated, service_role;

-- ============================================
-- 3. extend_task_txn
-- ============================================
CREATE OR REPLACE FUNCTION public.extend_task_txn(
  p_task_date date,
  p_task_number integer,
  p_new_date date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.extend_task_txn(date, integer, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.extend_task_txn(date, integer, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.extend_task_txn(date, integer, date) TO authenticated, service_role;
