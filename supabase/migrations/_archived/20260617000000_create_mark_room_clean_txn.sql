-- Migration: create_mark_room_clean_txn
-- Backfill: hàm đã tồn tại + đã chạy live trên Supabase, chưa có trong migration history của repo.
CREATE OR REPLACE FUNCTION public.mark_room_clean_txn(p_room_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room FROM rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: %', p_room_id USING ERRCODE = 'P0001';
  END IF;

  IF v_room.housekeeping_status = 'out_of_order' THEN
    RAISE EXCEPTION 'ROOM_OUT_OF_ORDER: Phòng % đang ở trạng thái hỏng/khóa, không thể đánh dấu dọn xong qua hàm này', p_room_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE rooms SET
    housekeeping_status = 'clean',
    housekeeping_note   = NULL,
    updated_at           = NOW()
  WHERE id = p_room_id;

  RETURN JSON_BUILD_OBJECT(
    'success',  TRUE,
    'room_id',  p_room_id,
    'status',   'clean'
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_room_clean_txn(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_room_clean_txn(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_room_clean_txn(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_room_clean_txn(text) TO service_role;
