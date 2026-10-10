-- void_payment_txn: them FOR UPDATE o SELECT payment de hai lan void dong thoi xep hang.
-- Giu nguyen SET search_path (CREATE OR REPLACE se xoa neu quen).
CREATE OR REPLACE FUNCTION public.void_payment_txn(p_payment_id uuid, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pay        payment_history%ROWTYPE;
  v_surcharge  INTEGER := 0;
  v_booking_id UUID;
BEGIN
  -- Lấy payment gốc (FOR UPDATE: hai lần void đồng thời phải xếp hàng, lần hai thấy is_void = TRUE)
  SELECT * INTO v_pay FROM payment_history WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: %', p_payment_id USING ERRCODE = 'P0020';
  END IF;

  -- Không void 2 lần
  IF v_pay.is_void THEN
    RAISE EXCEPTION 'ALREADY_VOIDED: Payment này đã bị void.' USING ERRCODE = 'P0021';
  END IF;

  -- Đánh dấu void trên row gốc
  UPDATE payment_history
     SET is_void = TRUE, updated_at = NOW()
   WHERE id = p_payment_id;

  -- Ghi reverse entry (âm) — audit trail
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

  -- Trừ lại groups.paid
  UPDATE groups
     SET paid = paid - v_pay.amount, updated_at = NOW()
   WHERE id = v_pay.group_id;

  -- Nếu method = card → reverse surcharge trên booking đầu tiên của group
  IF v_pay.method = 'card' THEN
    -- v_pay.amount đã là total (amount + surcharge), tính lại surcharge từ total
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
