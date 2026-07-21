-- =====================================================================
-- Fix High #5: room_blocks bypass RPC + RLS không validate
-- - Tạo RPC create_room_block_txn / delete_room_block_txn
-- - REVOKE direct INSERT/UPDATE/DELETE/TRUNCATE trên room_blocks
--   khỏi anon + authenticated (chỉ giữ SELECT cho authenticated)
-- =====================================================================

-- 1. RPC: tạo block phòng, chặn cứng nếu trùng booking active
CREATE OR REPLACE FUNCTION public.create_room_block_txn(
  p_room_id text,
  p_start_date date,
  p_end_date date,
  p_reason block_reason,
  p_note text DEFAULT NULL
)
RETURNS room_blocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conflict RECORD;
  v_block room_blocks;
BEGIN
  -- Validate ngày hợp lệ
  IF p_end_date <= p_start_date THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE: end_date phai sau start_date' USING ERRCODE = 'P0040';
  END IF;

  -- Chặn cứng nếu phòng có booking active (booked/checked-in) trong khoảng ngày block
  -- Logic overlap đối xứng với check_room_availability (chiều ngược: block vs booking)
  SELECT b.id, b.check_in, b.check_out, b.guest_name, b.status
    INTO v_conflict
    FROM bookings b
   WHERE b.room_id = p_room_id
     AND b.is_deleted = FALSE
     AND b.status IN ('booked', 'checked-in')
     AND b.check_in < p_end_date
     AND b.check_out > p_start_date
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ROOM_HAS_ACTIVE_BOOKING'
      USING ERRCODE = 'P0041',
      DETAIL = json_build_object(
        'booking_id', v_conflict.id,
        'guest_name', v_conflict.guest_name,
        'check_in', v_conflict.check_in,
        'check_out', v_conflict.check_out,
        'status', v_conflict.status
      )::text;
  END IF;

  INSERT INTO room_blocks (room_id, start_date, end_date, reason, note, created_by)
  VALUES (p_room_id, p_start_date, p_end_date, p_reason, p_note, auth.uid()::text)
  RETURNING * INTO v_block;

  RETURN v_block;
END;
$$;

-- 2. RPC: xoá block phòng (qua RPC để bắt buộc đi qua security definer, đồng bộ pattern)
CREATE OR REPLACE FUNCTION public.delete_room_block_txn(p_block_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_id uuid;
BEGIN
  DELETE FROM room_blocks WHERE id = p_block_id
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'BLOCK_NOT_FOUND' USING ERRCODE = 'P0042';
  END IF;

  RETURN json_build_object('success', true, 'block_id', v_deleted_id);
END;
$$;

-- 3. GRANT execute cho 2 RPC mới (chỉ authenticated — anon không cần thao tác block)
GRANT EXECUTE ON FUNCTION public.create_room_block_txn(text, date, date, block_reason, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_room_block_txn(uuid) TO authenticated;

-- 4. REVOKE direct mutation trên room_blocks khỏi anon + authenticated
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.room_blocks FROM authenticated;
REVOKE ALL ON public.room_blocks FROM anon;

-- 5. Cập nhật RLS: bỏ policy auth_write cũ (cho phép ALL không điều kiện),
-- thay bằng policy SELECT-only rõ ràng cho authenticated.
DROP POLICY IF EXISTS auth_write ON public.room_blocks;
DROP POLICY IF EXISTS auth_read ON public.room_blocks;

CREATE POLICY auth_read ON public.room_blocks
  FOR SELECT
  TO authenticated
  USING (true);
