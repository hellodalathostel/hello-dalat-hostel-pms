-- Migration: align_task_number_ordering_with_priority
-- Muc dich: Sua thu tu tinh task_number trong 3 RPC (complete/skip/extend)
-- de khop voi thu tu hien thi trong task-reminder (uu tien Khan > Cao > Binh Thuong > Thap,
-- tie-break theo created_at ASC). Truoc do ca 3 RPC chi ORDER BY created_at ASC,
-- gay lech so neu co task khac priority trong cung ngay.

-- ============================================
-- 1. complete_task_txn (sua thu tu ROW_NUMBER)
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
$$;

-- ============================================
-- 2. skip_task_txn (sua thu tu ROW_NUMBER)
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
$$;

-- ============================================
-- 3. extend_task_txn (sua thu tu ROW_NUMBER)
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
$$;
