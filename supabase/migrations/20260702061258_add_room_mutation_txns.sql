-- create_room_txn / update_room_txn / toggle_room_active_txn — chuyển INSERT/UPDATE trực tiếp
-- trên rooms (useRoomMutations.ts) vào RPC transactional, để validate tập trung ở DB (nguyên tắc
-- #2 của repo: All Mutations Via RPC). Đi cùng migration
-- 20260702061142_rooms_full_crud_owner_staff.sql (bỏ owner_write, mở CRUD rooms cho Owner+Staff).
CREATE OR REPLACE FUNCTION public.create_room_txn(
  p_id text,
  p_name text,
  p_type text,
  p_capacity integer,
  p_base_price integer,
  p_floor integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room_id text;
BEGIN
  IF p_id IS NULL OR trim(p_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ROOM_ID: id không được rỗng' USING ERRCODE = 'P0001';
  END IF;

  IF p_capacity IS NULL OR p_capacity <= 0 THEN
    RAISE EXCEPTION 'INVALID_CAPACITY: capacity phải > 0' USING ERRCODE = 'P0002';
  END IF;

  IF p_base_price IS NULL OR p_base_price < 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE: base_price phải >= 0' USING ERRCODE = 'P0003';
  END IF;

  IF EXISTS (SELECT 1 FROM rooms WHERE id = p_id) THEN
    RAISE EXCEPTION 'ROOM_ID_EXISTS: phòng % đã tồn tại', p_id USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO rooms (id, name, type, capacity, base_price, floor, ical_export_token, is_active, housekeeping_status)
  VALUES (
    p_id,
    p_name,
    p_type,
    p_capacity,
    p_base_price,
    p_floor,
    encode(gen_random_bytes(16), 'hex'),
    true,
    'clean'
  )
  RETURNING id INTO v_room_id;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'room_id', v_room_id);

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_room_txn(
  p_id text,
  p_name text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_capacity integer DEFAULT NULL,
  p_base_price integer DEFAULT NULL,
  p_floor integer DEFAULT NULL,
  p_floor_set boolean DEFAULT FALSE
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rooms WHERE id = p_id) THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: %', p_id USING ERRCODE = 'P0001';
  END IF;

  IF p_capacity IS NOT NULL AND p_capacity <= 0 THEN
    RAISE EXCEPTION 'INVALID_CAPACITY: capacity phải > 0' USING ERRCODE = 'P0002';
  END IF;

  IF p_base_price IS NOT NULL AND p_base_price < 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE: base_price phải >= 0' USING ERRCODE = 'P0003';
  END IF;

  UPDATE rooms
     SET name = COALESCE(p_name, name),
         type = COALESCE(p_type, type),
         capacity = COALESCE(p_capacity, capacity),
         base_price = COALESCE(p_base_price, base_price),
         floor = CASE WHEN p_floor_set THEN p_floor ELSE COALESCE(p_floor, floor) END,
         updated_at = NOW()
   WHERE id = p_id;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'room_id', p_id);

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_room_active_txn(p_id text, p_is_active boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rooms WHERE id = p_id) THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: %', p_id USING ERRCODE = 'P0001';
  END IF;

  UPDATE rooms SET is_active = p_is_active, updated_at = NOW() WHERE id = p_id;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'room_id', p_id, 'is_active', p_is_active);

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_room_txn(text, text, text, integer, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_room_txn(text, text, text, integer, integer, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_room_active_txn(text, boolean) TO authenticated, service_role;

-- Chặn PUBLIC/anon gọi trực tiếp khi chưa đăng nhập (Postgres grant EXECUTE cho PUBLIC theo
-- default khi tạo function, anon kế thừa qua đó nếu không revoke rõ ràng)
REVOKE EXECUTE ON FUNCTION public.create_room_txn(text, text, text, integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_room_txn(text, text, text, integer, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_room_txn(text, text, text, integer, integer, integer, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_room_txn(text, text, text, integer, integer, integer, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_room_active_txn(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_room_active_txn(text, boolean) FROM anon;
