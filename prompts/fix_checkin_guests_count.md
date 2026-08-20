# Task: Sync migration đã apply lên Supabase vào repo local

## Bối cảnh
Migration này đã được apply lên production qua Supabase MCP (`apply_migration`) —
KHÔNG cần chạy lại SQL, KHÔNG cần `supabase db push`. Chỉ cần tạo file local đúng
tên/nội dung để khớp migration history trên remote, tránh drift.

## Việc cần làm

1. Tạo file mới tại đường dẫn sau (copy chính xác, không đổi tên):

```
D:\hello-dalat-hostel-pms\supabase\migrations\20260820232755_fix_checkin_booking_txn_guests_count_accumulate.sql
```

2. Nội dung file — copy nguyên văn block SQL bên dưới vào file đó:

```sql
-- Fix: checkin_booking_txn.guests_count trước đây = JSON_ARRAY_LENGTH(p_guests)
-- của LẦN GỌI HIỆN TẠI, gây ghi đè (không cộng dồn) khi check-in nhiều đợt
-- (VD: import Excel/KBTT nhiều lần cho cùng 1 booking khi khách đến lệch giờ).
-- Fix: đếm guests_count từ booking_guests (nguồn sự thật), luôn = tổng khách
-- DUY NHẤT (theo document_number) thực sự gắn với booking, bất kể gọi bao nhiêu lần.
-- Đồng thời giữ nguyên actual_check_in của lần check-in đầu tiên thay vì bị ghi đè
-- mỗi lần gọi lại RPC.

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
  v_total_guests INTEGER;
BEGIN
  -- Validate booking tồn tại và trạng thái hợp lệ
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id USING ERRCODE = 'P0001';
  END IF;
  IF v_booking.status NOT IN ('booked', 'checked-in') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Booking đang ở trạng thái %, không thể check-in', v_booking.status
      USING ERRCODE = 'P0002';
  END IF;

  -- Upsert từng khách — ON CONFLICT theo composite (document_type, document_number)
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

  -- Upsert booking_guests
  FOR v_idx IN 1 .. ARRAY_LENGTH(v_customer_ids, 1) LOOP
    INSERT INTO booking_guests (booking_id, customer_id, is_primary)
    VALUES (p_booking_id, v_customer_ids[v_idx], v_idx = 1)
    ON CONFLICT (booking_id, customer_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;
  END LOOP;

  -- guests_count = tổng số khách DUY NHẤT thực sự đang gắn với booking này
  -- (đếm từ booking_guests, không phải từ JSON_ARRAY_LENGTH(p_guests) của lần gọi hiện tại)
  -- => cộng dồn đúng khi check-in nhiều đợt (import Excel nhiều lần, khách đến lệch giờ)
  SELECT COUNT(*) INTO v_total_guests
  FROM booking_guests
  WHERE booking_id = p_booking_id;

  -- Update booking status + actual_check_in + guests_count
  -- actual_check_in: giữ nguyên giá trị lần check-in đầu tiên nếu đã có
  UPDATE bookings SET
    status          = 'checked-in',
    actual_check_in = COALESCE(v_booking.actual_check_in, NOW()),
    guests_count    = v_total_guests,
    updated_at      = NOW()
  WHERE id = p_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'success',      TRUE,
    'booking_id',   p_booking_id,
    'guests_count', v_total_guests
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;
```

3. Git add + commit (KHÔNG chạy `supabase db push`, migration đã live trên remote rồi):

```powershell
git add supabase/migrations/20260820232755_fix_checkin_booking_txn_guests_count_accumulate.sql
git commit -m "fix(checkin): guests_count cong don tu booking_guests thay vi ghi de theo lan goi RPC"
```

## Không cần làm
- Không cần `supabase db push` — đã apply qua Supabase MCP.
- Không cần sửa code frontend — signature RPC không đổi (vẫn `p_booking_id`, `p_guests`).
- Không cần tạo migration mới nếu file đã tồn tại đúng version.
