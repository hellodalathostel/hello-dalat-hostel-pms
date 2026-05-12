-- RPC function để tạo room block
CREATE OR REPLACE FUNCTION create_room_block_txn(
  p_room_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_reason block_reason DEFAULT 'other',
  p_note TEXT DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block_id UUID;
BEGIN
  -- Validate input
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Start date and end date are required';
  END IF;

  IF p_start_date >= p_end_date THEN
    RAISE EXCEPTION 'Start date must be before end date';
  END IF;

  -- Insert room block
  INSERT INTO room_blocks (room_id, start_date, end_date, reason, note)
  VALUES (p_room_id, p_start_date, p_end_date, p_reason, p_note)
  RETURNING id INTO v_block_id;

  RETURN json_build_object(
    'success', true,
    'block_id', v_block_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- RPC function để xóa room block
CREATE OR REPLACE FUNCTION delete_room_block_txn(p_block_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if block exists
  IF NOT EXISTS (SELECT 1 FROM room_blocks WHERE id = p_block_id) THEN
    RAISE EXCEPTION 'Room block not found';
  END IF;

  -- Delete room block
  DELETE FROM room_blocks WHERE id = p_block_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Room block deleted successfully'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
