-- Migration: room_overlap_hardening
-- Mục tiêu: đóng khe hở race condition giữa bookings <-> room_blocks.
--   * bookings <-> bookings đã được chặn bởi exclusion constraint
--     no_overlapping_bookings_from_20260705 (không đổi ở đây).
--   * check_room_availability chỉ là check-then-insert, không khoá -> hai request
--     song song (tạo booking + tạo block cùng phòng/ngày) có thể cùng lọt qua.
-- Cách làm: advisory lock theo phòng + trigger kiểm tra chéo ở CẢ HAI bảng.
-- Không đổi signature RPC nào, không đổi dữ liệu, không thêm bảng.
-- LƯU Ý: đặt tên file theo timestamp thật (xem `supabase migration list`) trước khi push.

-- ---------------------------------------------------------------------------
-- 1) bookings: chặn booking đè lên room_block
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_bookings_check_room_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_block RECORD;
BEGIN
  -- Booking đã huỷ / xoá mềm thì không chiếm phòng
  IF NEW.status = 'cancelled' OR NEW.is_deleted IS TRUE THEN
    RETURN NEW;
  END IF;

  -- UPDATE không đổi phòng/ngày và không "sống lại" từ huỷ/xoá thì bỏ qua
  -- (tránh chặn nhầm checkout, đổi giá... của booking cũ)
  IF TG_OP = 'UPDATE'
     AND NEW.room_id IS NOT DISTINCT FROM OLD.room_id
     AND NEW.check_in = OLD.check_in
     AND NEW.check_out = OLD.check_out
     AND OLD.status <> 'cancelled'
     AND OLD.is_deleted IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Khoá theo phòng đến hết transaction: serialize với trigger bên room_blocks
  PERFORM pg_advisory_xact_lock(hashtextextended('room_avail:' || NEW.room_id, 0));

  SELECT rb.start_date, rb.end_date, rb.reason::text AS reason
    INTO v_block
    FROM room_blocks rb
   WHERE rb.room_id    = NEW.room_id
     AND rb.start_date < NEW.check_out
     AND rb.end_date   > NEW.check_in
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % đang bị khoá (% — % đến %)',
      NEW.room_id, v_block.reason, v_block.start_date, v_block.end_date;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_bookings_check_room_block() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bookings_check_room_block ON public.bookings;
CREATE TRIGGER trg_bookings_check_room_block
  BEFORE INSERT OR UPDATE OF room_id, check_in, check_out, status, is_deleted
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_bookings_check_room_block();

-- ---------------------------------------------------------------------------
-- 2) room_blocks: chặn block đè lên booking đang chiếm phòng
--    (cùng điều kiện với check_room_availability: chưa xoá, status <> cancelled)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_room_blocks_check_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_b RECORD;
BEGIN
  -- UPDATE không đổi phòng/ngày (vd sửa note) thì bỏ qua
  IF TG_OP = 'UPDATE'
     AND NEW.room_id IS NOT DISTINCT FROM OLD.room_id
     AND NEW.start_date = OLD.start_date
     AND NEW.end_date = OLD.end_date THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('room_avail:' || NEW.room_id, 0));

  SELECT b.check_in, b.check_out, b.guest_name
    INTO v_b
    FROM bookings b
   WHERE b.room_id   = NEW.room_id
     AND COALESCE(b.is_deleted, FALSE) = FALSE
     AND b.status   <> 'cancelled'
     AND b.check_in  < NEW.end_date
     AND b.check_out > NEW.start_date
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % đã có booking (% — % đến %), không thể khoá',
      NEW.room_id, v_b.guest_name, v_b.check_in, v_b.check_out;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_room_blocks_check_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_room_blocks_check_booking ON public.room_blocks;
CREATE TRIGGER trg_room_blocks_check_booking
  BEFORE INSERT OR UPDATE OF room_id, start_date, end_date
  ON public.room_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_room_blocks_check_booking();

-- ---------------------------------------------------------------------------
-- ROLLBACK (nếu cần, chạy tay):
--   DROP TRIGGER IF EXISTS trg_bookings_check_room_block ON public.bookings;
--   DROP TRIGGER IF EXISTS trg_room_blocks_check_booking ON public.room_blocks;
--   DROP FUNCTION IF EXISTS public.trg_bookings_check_room_block();
--   DROP FUNCTION IF EXISTS public.trg_room_blocks_check_booking();
-- ---------------------------------------------------------------------------
