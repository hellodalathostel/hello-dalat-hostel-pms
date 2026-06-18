# BACKFILL #2: Functions + Triggers (bổ sung cho backfill_schema_baseline)

## Bối cảnh
File `20260618000000_backfill_schema_baseline.sql` đã backfill TABLE + RLS + GRANT cho 23
bảng. File này bổ sung phần còn thiếu: **trigger functions** và **RPC functions**, để repo
phản ánh đầy đủ trạng thái DB thật.

Claude.ai đã lấy đầy đủ DDL chính xác qua `pg_get_functiondef()` trực tiếp từ DB — KHÔNG
cần `pg_dump`/Docker/psql cho phần này. Toàn bộ nội dung dưới đây là copy-paste, không tự
viết lại hay đoán thêm.

**Lưu ý quan trọng:** trong lúc audit, Claude.ai phát hiện bug thật trong
`add_booking_service_txn` (check status `'confirmed'` không tồn tại trong enum, lẽ ra phải
là `'booked'`) — Hiếu xác nhận đã từng gặp lỗi này. Claude.ai ĐÃ FIX TRỰC TIẾP qua
`apply_migration` riêng (migration `fix_add_booking_service_txn_status_check`) NGAY TRƯỚC
khi gửi file này. Nội dung function dưới đây trong file backfill này là **bản ĐÃ FIX**
(khớp với DB thật bây giờ) — không phải bản cũ có bug.

## Tạo file mới

Tên file: `supabase/migrations/20260618000001_backfill_functions_triggers.sql`

(số thứ tự `...001` — SAU file `...000` backfill_schema_baseline, để áp đúng thứ tự:
tables trước, functions sau, vì 1 số function reference tới bảng)

## Nội dung file — copy nguyên, không sửa

```sql
-- ============================================================================
-- BACKFILL MIGRATION #2 — Functions & Triggers checkpoint
-- Ngày tạo: 2026-06-18
-- Mục đích: Bổ sung cho 20260618000000_backfill_schema_baseline.sql — backfill
-- toàn bộ trigger functions + RPC functions (SECURITY DEFINER) đang chạy thật
-- trong production, lấy qua pg_get_functiondef() để đảm bảo khớp 100% logic thật.
-- Idempotent: CREATE OR REPLACE FUNCTION luôn an toàn để re-run.
-- Lưu ý: add_booking_service_txn trong file này là bản ĐÃ FIX bug status check
-- ('confirmed' → 'booked', vì enum booking_status không có giá trị 'confirmed').
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TRIGGER FUNCTIONS (chạy tự động qua trigger, không gọi trực tiếp từ code)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calc_booking_grand_total()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_services  INTEGER;
  v_discounts INTEGER;
BEGIN
  -- nights là generated column, Postgres tự tính — không cần gán NEW.nights
  -- room_subtotal = giá/đêm × số đêm
  NEW.room_subtotal := NEW.price_per_night * (NEW.check_out - NEW.check_in);

  SELECT COALESCE(SUM((price * qty)::INTEGER), 0) INTO v_services
    FROM booking_services WHERE booking_id = NEW.id;
  SELECT COALESCE(SUM(amount), 0) INTO v_discounts
    FROM booking_discounts WHERE booking_id = NEW.id;

  NEW.grand_total := NEW.room_subtotal + NEW.surcharge + NEW.tax_amount
                     + v_services - v_discounts;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_booking_grand_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_booking_id  UUID;
  v_booking     public.bookings%ROWTYPE;
  v_services    INTEGER;
  v_discounts   INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_booking_id := OLD.booking_id;
  ELSE
    v_booking_id := NEW.booking_id;
  END IF;

  SELECT * INTO v_booking
    FROM public.bookings WHERE id = v_booking_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM((price * qty)::INTEGER), 0) INTO v_services
    FROM public.booking_services WHERE booking_id = v_booking_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_discounts
    FROM public.booking_discounts WHERE booking_id = v_booking_id;

  UPDATE public.bookings
    SET grand_total = v_booking.room_subtotal + v_booking.surcharge
                    + v_booking.tax_amount + v_services - v_discounts
    WHERE id = v_booking_id;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_group_net_revenue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id    UUID;
  v_total_grand INTEGER;
  v_fee_rate    NUMERIC;
  v_net         INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_group_id := OLD.group_id;
  ELSE
    v_group_id := NEW.group_id;
  END IF;

  SELECT channel_fee_rate INTO v_fee_rate
    FROM public.groups
   WHERE id = v_group_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(grand_total), 0) INTO v_total_grand
    FROM public.bookings
   WHERE group_id   = v_group_id
     AND is_deleted = FALSE
     AND status    != 'cancelled';

  v_net := ROUND(v_total_grand * (1.0 - v_fee_rate));

  UPDATE public.groups
     SET net_revenue = v_net,
         updated_at  = NOW()
   WHERE id = v_group_id;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_ota_linked_group_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Chỉ xử lý khi external_ical_uid có giá trị
  IF NEW.external_ical_uid IS NOT NULL THEN
    UPDATE ota_calendar_feed
    SET linked_group_id = NEW.group_id
    WHERE ical_uid = NEW.external_ical_uid
      AND room_id   = NEW.room_id
      AND linked_group_id IS DISTINCT FROM NEW.group_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_room_dirty_on_checkout()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'checked-out' AND OLD.status IS DISTINCT FROM 'checked-out' THEN
    UPDATE public.rooms
    SET housekeeping_status = 'dirty',
        updated_at = now()
    WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_booking_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_base TEXT;
  v_seq  INT := 0;
  v_code TEXT;
BEGIN
  v_base := 'HD' ||
            TO_CHAR(NEW.check_in, 'YYMMDD') ||
            REPLACE(NEW.room_id, ' ', '');

  LOOP
    IF v_seq = 0 THEN
      v_code := v_base;
    ELSE
      v_code := v_base || '-' || LPAD(v_seq::TEXT, 2, '0');
    END IF;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM bookings WHERE code = v_code AND id != NEW.id
    );
    v_seq := v_seq + 1;
  END LOOP;

  NEW.code := v_code;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_ops_tasks_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- HELPER / READ-ONLY FUNCTIONS (không phải SECURITY DEFINER transaction, nhưng active)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS user_role
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT role FROM app_users WHERE id = auth.uid() LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.check_room_availability(p_room_id text, p_check_in date, p_check_out date, p_exclude_booking_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(available boolean, conflict_type text, conflict_id uuid, conflict_check_in date, conflict_check_out date, conflict_label text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_b  RECORD;
  v_bl RECORD;
BEGIN
  SELECT b.id, b.check_in, b.check_out, b.guest_name INTO v_b
    FROM bookings b
   WHERE b.room_id    = p_room_id
     AND b.is_deleted = FALSE
     AND b.status    != 'cancelled'
     AND b.check_in   < p_check_out
     AND b.check_out  > p_check_in
     AND (p_exclude_booking_id IS NULL OR b.id != p_exclude_booking_id)
   LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT FALSE, 'booking'::TEXT, v_b.id, v_b.check_in, v_b.check_out, v_b.guest_name;
    RETURN;
  END IF;

  SELECT rb.id, rb.start_date, rb.end_date, rb.reason::TEXT INTO v_bl
    FROM room_blocks rb
   WHERE rb.room_id    = p_room_id
     AND rb.start_date < p_check_out
     AND rb.end_date   > p_check_in
   LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT FALSE, 'block'::TEXT, v_bl.id, v_bl.start_date, v_bl.end_date, v_bl.reason;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::UUID, NULL::DATE, NULL::DATE, NULL::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_suggested_price(p_room_id text, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_base  INTEGER;
  v_price NUMERIC;
  v_rule  RECORD;
BEGIN
  SELECT base_price INTO v_base FROM rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_price := v_base;

  -- Rule cao nhất priority thắng (không cộng dồn — intentional design)
  SELECT multiplier, flat_amount INTO v_rule
    FROM pricing_rules
   WHERE is_active = TRUE
     AND (room_id IS NULL OR room_id = p_room_id)
     AND (start_date IS NULL OR start_date <= p_date)
     AND (end_date   IS NULL OR end_date   >= p_date)
     AND (day_of_week IS NULL
          OR EXTRACT(ISODOW FROM p_date)::INTEGER = ANY(day_of_week))
   ORDER BY priority DESC
   LIMIT 1;

  IF FOUND THEN
    IF v_rule.multiplier  IS NOT NULL THEN v_price := v_price * v_rule.multiplier;
    ELSIF v_rule.flat_amount IS NOT NULL THEN v_price := v_price + v_rule.flat_amount;
    END IF;
  END IF;

  RETURN ROUND(v_price);
END;
$function$;

-- ----------------------------------------------------------------------------
-- RPC FUNCTIONS — SECURITY DEFINER transactions (gọi trực tiếp từ frontend/Edge Functions)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_group_booking_txn(p_group json, p_bookings json, p_services json DEFAULT '[]'::json, p_discounts json DEFAULT '[]'::json)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id        UUID;
  v_booking_ids     UUID[];
  v_booking_id      UUID;
  v_booking         JSON;
  v_service         JSON;
  v_discount        JSON;
  v_idx             INTEGER;
  v_service_rec     RECORD;
  v_avail           RECORD;
  v_check_in        DATE;
  v_check_out       DATE;
  v_room_id         TEXT;
  v_nights          INTEGER;
  v_ext_ical_uid    TEXT;
BEGIN
  INSERT INTO groups (
    customer_name, customer_phone, customer_note,
    customer_cccd, source, channel_fee_rate
  )
  VALUES (
    p_group->>'customer_name',
    p_group->>'customer_phone',
    p_group->>'customer_note',
    p_group->>'customer_cccd',
    (p_group->>'source')::booking_source,
    COALESCE((p_group->>'channel_fee_rate')::NUMERIC, 0)
  )
  RETURNING id INTO v_group_id;

  v_booking_ids := ARRAY[]::UUID[];

  FOR v_idx IN 0 .. (JSON_ARRAY_LENGTH(p_bookings) - 1) LOOP
    v_booking        := p_bookings->v_idx;
    v_room_id        := v_booking->>'room_id';
    v_check_in       := (v_booking->>'check_in')::DATE;
    v_check_out      := (v_booking->>'check_out')::DATE;
    v_nights         := (v_check_out - v_check_in);
    v_ext_ical_uid   := v_booking->>'external_ical_uid';

    IF v_nights < 1 THEN
      RAISE EXCEPTION 'INVALID_NIGHTS: check_out phải sau check_in ít nhất 1 ngày (phòng %)', v_room_id
        USING ERRCODE = 'P0004';
    END IF;

    SELECT * INTO v_avail
      FROM check_room_availability(v_room_id, v_check_in, v_check_out, NULL);

    IF NOT v_avail.available THEN
      RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % bị xung đột (% — % đến %)',
        v_room_id, v_avail.conflict_type,
        v_avail.conflict_check_in, v_avail.conflict_check_out
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO bookings (
      group_id, room_id, check_in, check_out,
      price_per_night, guests_count, guest_name, note,
      external_ical_uid
    )
    VALUES (
      v_group_id, v_room_id, v_check_in, v_check_out,
      COALESCE((v_booking->>'price_per_night')::INTEGER, 0),
      COALESCE((v_booking->>'guests_count')::INTEGER, 1),
      p_group->>'customer_name',
      v_booking->>'note',
      v_ext_ical_uid
    )
    RETURNING id INTO v_booking_id;

    v_booking_ids := v_booking_ids || v_booking_id;
  END LOOP;

  IF p_services IS NOT NULL AND JSON_ARRAY_LENGTH(p_services) > 0 THEN
    FOR v_idx IN 0 .. (JSON_ARRAY_LENGTH(p_services) - 1) LOOP
      v_service := p_services->v_idx;

      SELECT name, price INTO v_service_rec
        FROM services
       WHERE id = v_service->>'service_id' AND is_deleted = FALSE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SERVICE_NOT_FOUND: Dịch vụ % không tồn tại.', v_service->>'service_id'
          USING ERRCODE = 'P0002';
      END IF;

      v_booking_id := v_booking_ids[(v_service->>'booking_index')::INTEGER + 1];
      IF v_booking_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_BOOKING_INDEX: %', v_service->>'booking_index'
          USING ERRCODE = 'P0003';
      END IF;

      INSERT INTO booking_services (booking_id, service_id, name, price, qty)
      VALUES (v_booking_id, v_service->>'service_id', v_service_rec.name,
              v_service_rec.price, COALESCE((v_service->>'qty')::NUMERIC, 1));
    END LOOP;
  END IF;

  IF p_discounts IS NOT NULL AND JSON_ARRAY_LENGTH(p_discounts) > 0 THEN
    FOR v_idx IN 0 .. (JSON_ARRAY_LENGTH(p_discounts) - 1) LOOP
      v_discount := p_discounts->v_idx;

      v_booking_id := v_booking_ids[(v_discount->>'booking_index')::INTEGER + 1];
      IF v_booking_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_BOOKING_INDEX: %', v_discount->>'booking_index'
          USING ERRCODE = 'P0003';
      END IF;

      INSERT INTO booking_discounts (booking_id, amount, description)
      VALUES (v_booking_id, (v_discount->>'amount')::INTEGER, v_discount->>'description');
    END LOOP;
  END IF;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'group_id', v_group_id, 'booking_ids', v_booking_ids);

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_booking_to_group_txn(p_group_id uuid, p_room_id text, p_check_in date, p_check_out date, p_price_per_night integer, p_guests_count integer DEFAULT 1, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nights      INTEGER;
  v_guest_name  TEXT;
  v_avail       RECORD;
  v_booking_id  UUID;
  v_group_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM groups
    WHERE id = p_group_id AND (is_deleted = false OR is_deleted IS NULL)
  ) INTO v_group_exists;

  IF NOT v_group_exists THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND: Group % không tồn tại hoặc đã bị xóa.', p_group_id
      USING ERRCODE = 'P0005';
  END IF;

  v_nights := (p_check_out - p_check_in);
  IF v_nights < 1 THEN
    RAISE EXCEPTION 'INVALID_NIGHTS: check_out phải sau check_in ít nhất 1 ngày (phòng %)', p_room_id
      USING ERRCODE = 'P0004';
  END IF;

  SELECT * INTO v_avail
    FROM check_room_availability(p_room_id, p_check_in, p_check_out, NULL);

  IF NOT v_avail.available THEN
    RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % bị xung đột (% — % đến %)',
      p_room_id, v_avail.conflict_type,
      v_avail.conflict_check_in, v_avail.conflict_check_out
      USING ERRCODE = 'P0001';
  END IF;

  SELECT customer_name INTO v_guest_name
    FROM groups WHERE id = p_group_id;

  INSERT INTO bookings (
    group_id, room_id, check_in, check_out,
    price_per_night, guests_count, guest_name, note
  )
  VALUES (
    p_group_id, p_room_id, p_check_in, p_check_out,
    p_price_per_night, p_guests_count, v_guest_name, p_note
  )
  RETURNING id INTO v_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success', TRUE,
    'booking_id', v_booking_id,
    'group_id', p_group_id
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_booking_txn(p_booking_id uuid, p_room_id text DEFAULT NULL::text, p_check_in date DEFAULT NULL::date, p_check_out date DEFAULT NULL::date, p_price_per_night integer DEFAULT NULL::integer, p_guests_count integer DEFAULT NULL::integer, p_guest_name text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_cancel boolean DEFAULT false, p_override_checkin boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking   RECORD;
  v_avail     RECORD;
  v_new_room  TEXT;
  v_new_ci    DATE;
  v_new_co    DATE;
  v_role      user_role;
BEGIN
  v_role := current_user_role();

  SELECT id, status, room_id, check_in, check_out, is_deleted
    INTO v_booking
    FROM bookings
   WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.is_deleted THEN
    RAISE EXCEPTION 'BOOKING_DELETED' USING ERRCODE = 'P0003';
  END IF;

  IF v_booking.status = 'checked-in' THEN
    IF NOT p_override_checkin THEN
      RAISE EXCEPTION 'BOOKING_NOT_EDITABLE: Booking đang checked-in, cần xác nhận override.'
        USING ERRCODE = 'P0002';
    END IF;
    IF v_role != 'owner' THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Chỉ Owner mới được sửa booking đang checked-in.'
        USING ERRCODE = 'P0006';
    END IF;
  ELSIF v_booking.status NOT IN ('booked') THEN
    RAISE EXCEPTION 'BOOKING_NOT_EDITABLE: status % không thể sửa.',
      v_booking.status USING ERRCODE = 'P0002';
  END IF;

  IF p_cancel THEN
    UPDATE bookings
       SET status     = 'cancelled',
           is_deleted = TRUE,
           updated_at = NOW()
     WHERE id = p_booking_id;

    RETURN json_build_object(
      'success', true,
      'action', 'cancelled',
      'booking_id', p_booking_id
    );
  END IF;

  v_new_room := COALESCE(p_room_id, v_booking.room_id);
  v_new_ci   := COALESCE(p_check_in, v_booking.check_in);
  v_new_co   := COALESCE(p_check_out, v_booking.check_out);

  IF v_new_co <= v_new_ci THEN
    RAISE EXCEPTION 'INVALID_DATES: check_out phải sau check_in' USING ERRCODE = 'P0004';
  END IF;

  SELECT * INTO v_avail
    FROM check_room_availability(v_new_room, v_new_ci, v_new_co, p_booking_id);

  IF NOT v_avail.available THEN
    RAISE EXCEPTION 'ROOM_CONFLICT: Phòng % bị xung đột (% — % đến %)',
      v_new_room, v_avail.conflict_type,
      v_avail.conflict_check_in, v_avail.conflict_check_out
      USING ERRCODE = 'P0005';
  END IF;

  UPDATE bookings SET
    room_id       = v_new_room,
    check_in      = v_new_ci,
    check_out     = v_new_co,
    price_per_night = COALESCE(p_price_per_night, price_per_night),
    guests_count  = COALESCE(p_guests_count, guests_count),
    guest_name    = COALESCE(p_guest_name, guest_name),
    note          = COALESCE(p_note, note),
    updated_at    = NOW()
  WHERE id = p_booking_id;

  RETURN json_build_object(
    'success', true,
    'action', 'updated',
    'booking_id', p_booking_id,
    'room_id', v_new_room,
    'check_in', v_new_ci,
    'check_out', v_new_co
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.checkin_booking_txn(p_booking_id uuid, p_guests json)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking      bookings%ROWTYPE;
  v_guest        JSON;
  v_customer_id  UUID;
  v_customer_ids UUID[];
  v_idx          INTEGER;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id USING ERRCODE = 'P0001';
  END IF;
  IF v_booking.status NOT IN ('booked', 'checked-in') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Booking đang ở trạng thái %, không thể check-in', v_booking.status
      USING ERRCODE = 'P0002';
  END IF;

  v_customer_ids := ARRAY[]::UUID[];
  FOR v_idx IN 0 .. (JSON_ARRAY_LENGTH(p_guests) - 1) LOOP
    v_guest := p_guests->v_idx;

    INSERT INTO customers (
      full_name, document_type, document_number,
      nationality, date_of_birth, gender,
      residency_type, province, district, ward, address_detail
    )
    VALUES (
      v_guest->>'full_name',
      (v_guest->>'document_type')::document_type,
      v_guest->>'document_number',
      v_guest->>'nationality',
      NULLIF(v_guest->>'date_of_birth', '')::DATE,
      v_guest->>'gender',
      (NULLIF(v_guest->>'residency_type', ''))::residency_type,
      v_guest->>'province',
      v_guest->>'district',
      v_guest->>'ward',
      v_guest->>'address_detail'
    )
    ON CONFLICT ON CONSTRAINT uq_customers_doc
    DO UPDATE SET
      full_name     = EXCLUDED.full_name,
      nationality   = EXCLUDED.nationality,
      date_of_birth = EXCLUDED.date_of_birth,
      gender        = EXCLUDED.gender,
      updated_at    = NOW()
    RETURNING id INTO v_customer_id;

    v_customer_ids := v_customer_ids || v_customer_id;
  END LOOP;

  FOR v_idx IN 1 .. ARRAY_LENGTH(v_customer_ids, 1) LOOP
    INSERT INTO booking_guests (booking_id, customer_id, is_primary)
    VALUES (p_booking_id, v_customer_ids[v_idx], v_idx = 1)
    ON CONFLICT (booking_id, customer_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;
  END LOOP;

  UPDATE bookings SET
    status          = 'checked-in',
    actual_check_in = NOW(),
    guests_count    = JSON_ARRAY_LENGTH(p_guests),
    updated_at      = NOW()
  WHERE id = p_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success',      TRUE,
    'booking_id',   p_booking_id,
    'guests_count', ARRAY_LENGTH(v_customer_ids, 1)
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.checkout_booking_txn(p_booking_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking  bookings%ROWTYPE;
  v_paid     INTEGER;
  v_total    INTEGER;
  v_warning  TEXT := NULL;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id USING ERRCODE = 'P0001';
  END IF;
  IF v_booking.status != 'checked-in' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Booking đang ở trạng thái %, cần checked-in để check-out', v_booking.status
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COALESCE(g.net_revenue, 0),
    COALESCE(SUM(ph.amount), 0)
  INTO v_total, v_paid
  FROM groups g
  LEFT JOIN payment_history ph ON ph.group_id = g.id
  WHERE g.id = v_booking.group_id
  GROUP BY g.net_revenue;

  IF v_total > 0 AND v_paid < v_total THEN
    v_warning := FORMAT('Còn thiếu %s VNĐ chưa thanh toán', (v_total - v_paid)::TEXT);
  END IF;

  UPDATE bookings SET
    status           = 'checked-out',
    actual_check_out = NOW(),
    updated_at       = NOW()
  WHERE id = p_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success',    TRUE,
    'booking_id', p_booking_id,
    'warning',    v_warning
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.checkout_group_txn(p_group_id uuid, p_booking_ids uuid[], p_payment_amount integer DEFAULT 0, p_payment_method payment_method DEFAULT NULL::payment_method, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result JSON;
BEGIN
  IF p_payment_amount > 0 AND p_payment_method IS NOT NULL THEN
    PERFORM record_payment_txn(
      p_group_id,
      p_payment_amount,
      p_payment_method,
      COALESCE(p_note, 'Thu tại checkout'),
      p_booking_ids[1]
    );
  END IF;

  UPDATE public.bookings
  SET
    status = 'checked-out',
    actual_check_out = NOW(),
    updated_at = NOW()
  WHERE id = ANY(p_booking_ids)
    AND group_id = p_group_id
    AND is_deleted = FALSE;

  UPDATE public.groups
  SET
    status = 'checked-out',
    updated_at = NOW()
  WHERE id = p_group_id;

  RETURN json_build_object('ok', true, 'group_id', p_group_id);

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'checkout_group_txn failed: %', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_payment_txn(p_group_id uuid, p_amount integer, p_method payment_method, p_note text DEFAULT NULL::text, p_first_booking_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_surcharge_amount INTEGER := 0;
  v_total_paid INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Số tiền phải lớn hơn 0.' USING ERRCODE = 'P0010';
  END IF;

  IF p_method = 'card' THEN
    IF p_first_booking_id IS NULL THEN
      RAISE EXCEPTION 'MISSING_BOOKING_ID: bắt buộc khi method = card.' USING ERRCODE = 'P0012';
    END IF;

    v_surcharge_amount := ROUND(p_amount * 0.04);

    UPDATE bookings
       SET surcharge = surcharge + v_surcharge_amount, updated_at = NOW()
     WHERE id = p_first_booking_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_first_booking_id USING ERRCODE = 'P0013';
    END IF;
  END IF;

  v_total_paid := p_amount + v_surcharge_amount;

  INSERT INTO payment_history (group_id, amount, method, date, note)
  VALUES (p_group_id, v_total_paid, p_method, CURRENT_DATE, p_note);

  UPDATE groups SET paid = paid + v_total_paid, updated_at = NOW()
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND: %', p_group_id USING ERRCODE = 'P0011';
  END IF;

  RETURN JSON_BUILD_OBJECT(
    'success', TRUE,
    'group_id', p_group_id,
    'amount_recorded', p_amount,
    'surcharge_amount', v_surcharge_amount,
    'total_paid', v_total_paid,
    'method', p_method::TEXT,
    'card_fee_applied', (p_method = 'card')
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.void_payment_txn(p_payment_id uuid, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pay        payment_history%ROWTYPE;
  v_surcharge  INTEGER := 0;
  v_booking_id UUID;
BEGIN
  SELECT * INTO v_pay FROM payment_history WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: %', p_payment_id USING ERRCODE = 'P0020';
  END IF;

  IF v_pay.is_void THEN
    RAISE EXCEPTION 'ALREADY_VOIDED: Payment này đã bị void.' USING ERRCODE = 'P0021';
  END IF;

  UPDATE payment_history
     SET is_void = TRUE, updated_at = NOW()
   WHERE id = p_payment_id;

  INSERT INTO payment_history (group_id, amount, method, date, note, is_void, voided_payment_id)
  VALUES (
    v_pay.group_id,
    -v_pay.amount,
    v_pay.method,
    CURRENT_DATE,
    COALESCE(p_note, 'Void: nhập nhầm'),
    TRUE,
    p_payment_id
  );

  UPDATE groups
     SET paid = paid - v_pay.amount, updated_at = NOW()
   WHERE id = v_pay.group_id;

  IF v_pay.method = 'card' THEN
    v_surcharge := v_pay.amount - ROUND(v_pay.amount / 1.04);

    SELECT id INTO v_booking_id
    FROM bookings
    WHERE group_id = v_pay.group_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_booking_id IS NOT NULL THEN
      UPDATE bookings
         SET surcharge = GREATEST(0, surcharge - v_surcharge),
             updated_at = NOW()
       WHERE id = v_booking_id;
    END IF;
  END IF;

  RETURN JSON_BUILD_OBJECT(
    'success',            TRUE,
    'voided_payment_id',  p_payment_id,
    'amount_reversed',    v_pay.amount,
    'method',             v_pay.method::TEXT,
    'surcharge_reversed', v_surcharge
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.void_checkedout_booking_txn(p_booking_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking  RECORD;
  v_role     user_role;
BEGIN
  v_role := current_user_role();
  IF v_role != 'owner' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Chỉ Owner mới được xóa booking đã trả phòng.'
      USING ERRCODE = 'P0006';
  END IF;

  SELECT id, status, group_id, is_deleted
    INTO v_booking
    FROM bookings
   WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.is_deleted THEN
    RAISE EXCEPTION 'BOOKING_DELETED' USING ERRCODE = 'P0003';
  END IF;

  IF v_booking.status != 'checked-out' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Chỉ có thể void booking đã checked-out, hiện tại: %',
      v_booking.status USING ERRCODE = 'P0002';
  END IF;

  UPDATE bookings SET
    is_deleted = TRUE,
    status     = 'cancelled',
    note       = CASE
                   WHEN p_reason IS NOT NULL
                   THEN COALESCE(note || E'\n', '') || '[VOID] ' || p_reason
                   ELSE COALESCE(note, '')
                 END,
    updated_at = NOW()
  WHERE id = p_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success',    TRUE,
    'action',     'voided',
    'booking_id', p_booking_id,
    'group_id',   v_booking.group_id
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

-- add_booking_service_txn — BẢN ĐÃ FIX (status check 'confirmed'→'booked', xem ghi chú đầu file)
CREATE OR REPLACE FUNCTION public.add_booking_service_txn(p_booking_id uuid, p_service_id text DEFAULT NULL::text, p_qty numeric DEFAULT 1, p_custom_name text DEFAULT NULL::text, p_custom_price integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking   RECORD;
  v_svc_name  TEXT;
  v_svc_price INTEGER;
BEGIN
  SELECT id, status, group_id
    INTO v_booking
    FROM bookings
   WHERE id = p_booking_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status NOT IN ('booked', 'checked-in') THEN
    RAISE EXCEPTION 'BOOKING_INVALID_STATUS: chỉ thêm dịch vụ khi booked hoặc checked-in, hiện tại: %',
      v_booking.status USING ERRCODE = 'P0002';
  END IF;

  IF p_service_id IS NOT NULL THEN
    SELECT name, price INTO v_svc_name, v_svc_price
      FROM services
     WHERE id = p_service_id AND is_deleted = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_NOT_FOUND: %', p_service_id USING ERRCODE = 'P0003';
    END IF;
  ELSE
    IF p_custom_name IS NULL OR p_custom_price IS NULL THEN
      RAISE EXCEPTION 'CUSTOM_SERVICE_MISSING_FIELDS: cần p_custom_name và p_custom_price' USING ERRCODE = 'P0004';
    END IF;
    v_svc_name  := p_custom_name;
    v_svc_price := p_custom_price;
  END IF;

  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QTY: qty phải > 0' USING ERRCODE = 'P0005';
  END IF;

  INSERT INTO booking_services (booking_id, service_id, name, price, qty)
  VALUES (p_booking_id, p_service_id, v_svc_name, v_svc_price, p_qty);

  UPDATE bookings
     SET updated_at = NOW()
   WHERE id = p_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success',    TRUE,
    'booking_id', p_booking_id,
    'service',    v_svc_name,
    'qty',        p_qty,
    'amount',     v_svc_price * p_qty
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_early_late_txn(p_booking_id uuid, p_type text, p_fee integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_booking         bookings%ROWTYPE;
  v_new_check_in    DATE;
  v_new_check_out   DATE;
  v_check_date_from DATE;
  v_check_date_to   DATE;
  v_service_id      TEXT;
  v_service_name    TEXT;
  v_available       BOOLEAN;
BEGIN
  SELECT * INTO v_booking
    FROM bookings
   WHERE id = p_booking_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  IF p_type = 'early' AND v_booking.has_early_check_in = true THEN
    RAISE EXCEPTION 'early_check_in_already_applied';
  END IF;
  IF p_type = 'late' AND v_booking.has_late_check_out = true THEN
    RAISE EXCEPTION 'late_check_out_already_applied';
  END IF;

  IF p_type = 'early' THEN
    v_new_check_in  := v_booking.check_in - INTERVAL '1 day';
    v_new_check_out := v_booking.check_out;
    v_check_date_from := v_new_check_in;
    v_check_date_to   := v_booking.check_in;
    v_service_id   := 'early-check-in';
    v_service_name := 'Early Check-in';
  ELSIF p_type = 'late' THEN
    v_new_check_in  := v_booking.check_in;
    v_new_check_out := v_booking.check_out + INTERVAL '1 day';
    v_check_date_from := v_booking.check_out;
    v_check_date_to   := v_new_check_out;
    v_service_id   := 'late-check-out';
    v_service_name := 'Late Check-out';
  ELSE
    RAISE EXCEPTION 'invalid_type: must be early or late';
  END IF;

  SELECT check_room_availability(
      v_booking.room_id,
      v_check_date_from,
      v_check_date_to,
      p_booking_id
    ) INTO v_available;

  IF NOT v_available THEN
    RAISE EXCEPTION 'room_not_available';
  END IF;

  UPDATE bookings SET
    check_in             = CASE WHEN p_type = 'early' THEN v_new_check_in  ELSE check_in  END,
    check_out            = CASE WHEN p_type = 'late'  THEN v_new_check_out ELSE check_out END,
    has_early_check_in   = CASE WHEN p_type = 'early' THEN true ELSE has_early_check_in   END,
    has_late_check_out   = CASE WHEN p_type = 'late'  THEN true ELSE has_late_check_out   END,
    updated_at           = now()
  WHERE id = p_booking_id;

  INSERT INTO booking_services (booking_id, service_id, name, price, qty)
  VALUES (p_booking_id, v_service_id, v_service_name, p_fee, 1);

  RETURN jsonb_build_object(
    'success',        true,
    'type',           p_type,
    'new_check_in',   v_new_check_in,
    'new_check_out',  v_new_check_out,
    'fee',            p_fee
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_ota_block(p_block_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_block ota_calendar_feed;
BEGIN
  SELECT * INTO v_block
  FROM ota_calendar_feed
  WHERE id = p_block_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OTA_BLOCK_NOT_FOUND' USING ERRCODE = 'P0030';
  END IF;

  IF v_block.is_cancelled THEN
    RAISE EXCEPTION 'OTA_BLOCK_ALREADY_CANCELLED' USING ERRCODE = 'P0031';
  END IF;

  UPDATE ota_calendar_feed
  SET
    is_cancelled = true,
    cancelled_at = now(),
    cancelled_by = auth.uid()
  WHERE id = p_block_id;

  RETURN JSON_BUILD_OBJECT(
    'success', true,
    'block_id', p_block_id,
    'linked_group_id', v_block.linked_group_id
  );
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.update_housekeeping_status(p_room_id text, p_status housekeeping_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE rooms
  SET
    housekeeping_status = p_status,
    housekeeping_note   = COALESCE(p_note, housekeeping_note),
    updated_at          = NOW()
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room % not found', p_room_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_manual_revenue_txn(p_period date, p_source text, p_amount integer, p_note text DEFAULT NULL::text)
 RETURNS revenue_manual_log
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.revenue_manual_log;
BEGIN
  IF p_source NOT IN ('room_cash', 'service', 'other') THEN
    RAISE EXCEPTION 'Invalid source: %', p_source
      USING ERRCODE = 'P0030';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive'
      USING ERRCODE = 'P0031';
  END IF;

  INSERT INTO public.revenue_manual_log (period, source, amount, note)
    VALUES (p_period, p_source, p_amount, p_note)
    RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_tax_threshold_summary(p_year integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year INT := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
  v_threshold BIGINT := 1000000000;
  v_pms_actual BIGINT;
  v_pms_future BIGINT;
  v_manual_total BIGINT;
  v_total_actual BIGINT;
  v_months_with_data INT;
  v_avg_per_month NUMERIC;
  v_months_remaining INT;
  v_forecast_total BIGINT;
  v_current_month INT := EXTRACT(MONTH FROM CURRENT_DATE)::INT;
  v_current_year INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  v_by_month JSON;
  v_status TEXT;
BEGIN
  SELECT COALESCE(SUM(so_tien), 0) INTO v_pms_actual
  FROM v_s1a_hkd
  WHERE nam = v_year AND ngay_ghi_so <= CURRENT_DATE;

  SELECT COALESCE(SUM(so_tien), 0) INTO v_pms_future
  FROM v_s1a_hkd
  WHERE nam = v_year AND ngay_ghi_so > CURRENT_DATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_manual_total
  FROM revenue_manual_log
  WHERE EXTRACT(YEAR FROM period) = v_year;

  v_total_actual := v_pms_actual + v_manual_total;

  WITH pms_m AS (
    SELECT thang, SUM(so_tien) AS tong
    FROM v_s1a_hkd WHERE nam = v_year AND ngay_ghi_so <= CURRENT_DATE
    GROUP BY thang
  ),
  manual_m AS (
    SELECT EXTRACT(MONTH FROM period)::INT AS thang, SUM(amount) AS tong
    FROM revenue_manual_log
    WHERE EXTRACT(YEAR FROM period) = v_year
    GROUP BY EXTRACT(MONTH FROM period)
  ),
  merged AS (
    SELECT COALESCE(p.thang, m.thang) AS thang,
           COALESCE(p.tong, 0) + COALESCE(m.tong, 0) AS tong
    FROM pms_m p FULL OUTER JOIN manual_m m ON p.thang = m.thang
  )
  SELECT json_agg(json_build_object('thang', thang, 'doanh_thu', tong) ORDER BY thang)
  INTO v_by_month
  FROM merged;

  IF v_year = v_current_year THEN
    SELECT COUNT(DISTINCT thang) INTO v_months_with_data
    FROM v_s1a_hkd WHERE nam = v_year AND ngay_ghi_so <= CURRENT_DATE;

    IF v_months_with_data > 0 THEN
      v_avg_per_month := v_total_actual::NUMERIC / v_months_with_data;
      v_months_remaining := 12 - v_current_month;
      v_forecast_total := v_total_actual + ROUND(v_avg_per_month * v_months_remaining);
    ELSE
      v_forecast_total := v_total_actual;
    END IF;
  ELSE
    v_forecast_total := v_total_actual;
  END IF;

  v_status := CASE
    WHEN v_total_actual > v_threshold THEN 'red'
    WHEN v_total_actual >= 800000000 THEN 'yellow'
    ELSE 'green'
  END;

  RETURN json_build_object(
    'year', v_year,
    'pms_actual', v_pms_actual,
    'pms_future_booked', v_pms_future,
    'manual_total', v_manual_total,
    'total_actual', v_total_actual,
    'threshold', v_threshold,
    'percent_of_threshold', ROUND((v_total_actual::NUMERIC / v_threshold * 100), 1),
    'remaining_to_threshold', v_threshold - v_total_actual,
    'status', v_status,
    'forecast_total', v_forecast_total,
    'forecast_exceeds_threshold', v_forecast_total > v_threshold,
    'is_current_year', v_year = v_current_year,
    'by_month', COALESCE(v_by_month, '[]'::json)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_document_log(p_group_id uuid, p_booking_id uuid DEFAULT NULL::uuid, p_doc_type doc_kind DEFAULT 'booking_confirmation'::doc_kind, p_doc_format doc_format DEFAULT 'pdf'::doc_format, p_content_snapshot jsonb DEFAULT '{}'::jsonb, p_sent_via text DEFAULT NULL::text, p_recipient_name text DEFAULT NULL::text, p_recipient_phone text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_log_id  uuid;
BEGIN
  SELECT au.id INTO v_user_id
  FROM public.app_users au
  JOIN auth.users su ON su.email = au.email
  WHERE su.id = auth.uid()
  LIMIT 1;

  INSERT INTO public.document_logs (
    group_id, booking_id, doc_type, doc_format,
    content_snapshot, generated_by,
    sent_via, recipient_name, recipient_phone, note
  ) VALUES (
    p_group_id, p_booking_id, p_doc_type, p_doc_format,
    p_content_snapshot, v_user_id,
    p_sent_via, p_recipient_name, p_recipient_phone, p_note
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_brain_daily_log(p_log_date date, p_category text, p_content text, p_source text DEFAULT 'edge-function'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'brain', 'public'
AS $function$
BEGIN
  DELETE FROM brain.daily_log
  WHERE log_date = p_log_date AND category = p_category;

  INSERT INTO brain.daily_log (log_date, category, content, source)
  VALUES (p_log_date, p_category, p_content, p_source);
END;
$function$;
```

## Lưu ý — KHÔNG bao gồm trong file này
- `rls_auto_enable()` — đây là EVENT TRIGGER function (chạy khi CREATE TABLE), không phải
  table trigger hay RPC. Việc backfill event trigger phức tạp hơn (cần `CREATE EVENT
  TRIGGER` riêng) và không ảnh hưởng tới 23 bảng đã tồn tại — bỏ qua trong phạm vi backfill
  này, ghi chú lại trong file để biết tại sao thiếu.

Thêm cuối file (trước dòng cuối):
```sql
-- Lưu ý: rls_auto_enable() là EVENT TRIGGER (tự enable RLS khi CREATE TABLE mới),
-- không backfill ở đây vì cần CREATE EVENT TRIGGER riêng và không ảnh hưởng 23 bảng
-- đã tồn tại. Đã tồn tại trong DB thật, không cần tạo lại qua migration này.
```

## Sau khi tạo file
1. KHÔNG tự apply lại (DB đã có sẵn các function này, CREATE OR REPLACE chỉ là backfill).
2. Báo cáo: số dòng file, danh sách function đã include (đối chiếu đủ 27 function: 9 trigger
   + 2 helper + 16 RPC, KHÔNG tính rls_auto_enable).
3. Dừng, chờ Claude.ai xác nhận trước khi commit cả 2 file backfill vào Git.