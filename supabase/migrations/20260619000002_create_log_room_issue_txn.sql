-- =====================================================================
-- Fix High #6A: /issue không transactional
-- Gộp INSERT room_issues + UPDATE rooms.housekeeping_note vào 1 RPC
-- Apply ngày 2026-06-19 qua MCP (đã live trên DB)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.log_room_issue_txn(
  p_room_id     text,
  p_description text,
  p_reported_by text DEFAULT 'staff_telegram'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_issue_id uuid;
BEGIN
  -- Kiểm tra phòng tồn tại
  IF NOT EXISTS (SELECT 1 FROM rooms WHERE id = p_room_id) THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE = 'P0050';
  END IF;

  -- INSERT sự cố
  INSERT INTO room_issues (room_id, reported_by, description, status)
  VALUES (p_room_id, p_reported_by, p_description, 'open')
  RETURNING id INTO v_issue_id;

  -- UPDATE housekeeping_note để hiện trong /rooms (cùng transaction)
  UPDATE rooms
  SET housekeeping_note = '\u26a0\ufe0f ' || p_description,
      updated_at        = now()
  WHERE id = p_room_id;

  RETURN json_build_object(
    'success',  true,
    'issue_id', v_issue_id,
    'room_id',  p_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_room_issue_txn(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_room_issue_txn(text, text, text) TO service_role;