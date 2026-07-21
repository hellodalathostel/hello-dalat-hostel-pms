-- Them kha nang huy giao dich nhap tay (soft-delete) va mo lai ca da chot.
-- Soft-delete de giu dau vet, khong DELETE that.

ALTER TABLE public.cash_book_entries
  ADD COLUMN IF NOT EXISTS is_void      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS void_reason  text,
  ADD COLUMN IF NOT EXISTS voided_at    timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by    uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.cash_book_entries.is_void IS
  'Giao dich da huy. View cash_book_detail loc bo cac dong nay.';

-- View phai loc bo dong da void, neu khong so quy sai
CREATE OR REPLACE VIEW public.cash_book_detail
WITH (security_invoker = true) AS
 SELECT ph.date AS entry_date,
    'in'::text AS direction,
    'guest_payment'::text AS entry_type,
    ph.amount,
    COALESCE('Thu khach - '::text || g.customer_name, 'Thu khach'::text) AS description,
    ph.id AS ref_id,
    'payment_history'::text AS ref_table,
    ph.created_at
   FROM payment_history ph
     LEFT JOIN groups g ON g.id = ph.group_id
  WHERE ph.is_void = false AND ph.method = 'cash'::payment_method
UNION ALL
 SELECT e.date AS entry_date,
    'out'::text AS direction,
    'expense'::text AS entry_type,
    e.amount,
    COALESCE((e.category::text || ' - '::text) || e.description, e.category::text) AS description,
    e.id AS ref_id,
    'expenses'::text AS ref_table,
    e.created_at
   FROM expenses e
  WHERE e.payment_method = 'cash'::payment_method
UNION ALL
 SELECT pt.transaction_date AS entry_date,
        CASE
            WHEN pt.direction = 'collected'::text THEN 'in'::text
            ELSE 'out'::text
        END AS direction,
    'pass_through'::text AS entry_type,
    pt.amount,
    'Thu chi ho - '::text || COALESCE(pt.partner_name, ''::text) AS description,
    pt.id AS ref_id,
    'pass_through_transactions'::text AS ref_table,
    pt.created_at
   FROM pass_through_transactions pt
  WHERE pt.payment_method = 'cash'::text
UNION ALL
 SELECT cb.entry_date,
    cb.direction,
    cb.entry_type,
    cb.amount,
    cb.description,
    cb.id AS ref_id,
    'cash_book_entries'::text AS ref_table,
    cb.created_at
   FROM cash_book_entries cb
  WHERE cb.is_void = false;

-- RPC 1: Huy giao dich nhap tay
CREATE OR REPLACE FUNCTION public.void_cash_book_entry_txn(
  p_entry_id uuid,
  p_reason   text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry_date date;
  v_amount     integer;
  v_is_void    boolean;
  v_closed     timestamptz;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Phai ghi ly do huy giao dich';
  END IF;

  SELECT entry_date, amount, is_void
  INTO v_entry_date, v_amount, v_is_void
  FROM public.cash_book_entries WHERE id = p_entry_id;

  IF v_entry_date IS NULL THEN
    RAISE EXCEPTION 'Khong tim thay giao dich';
  END IF;

  IF v_is_void THEN
    RAISE EXCEPTION 'Giao dich nay da bi huy truoc do';
  END IF;

  -- Ngay da chot ca thi phai mo lai ca truoc
  SELECT closed_at INTO v_closed
  FROM public.cash_shifts WHERE shift_date = v_entry_date;

  IF v_closed IS NOT NULL THEN
    RAISE EXCEPTION 'Ngay % da chot ca luc %. Mo lai ca truoc khi huy giao dich.',
      v_entry_date, v_closed;
  END IF;

  UPDATE public.cash_book_entries SET
    is_void     = true,
    void_reason = p_reason,
    voided_at   = now(),
    voided_by   = auth.uid(),
    updated_at  = now()
  WHERE id = p_entry_id;

  RETURN json_build_object(
    'id',         p_entry_id,
    'entry_date', v_entry_date,
    'amount',     v_amount,
    'message',    'Da huy giao dich'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.void_cash_book_entry_txn(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_cash_book_entry_txn(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_cash_book_entry_txn(uuid, text) TO authenticated;

-- RPC 2: Sua giao dich nhap tay
CREATE OR REPLACE FUNCTION public.update_cash_book_entry_txn(
  p_entry_id    uuid,
  p_entry_type  text,
  p_amount      integer,
  p_description text,
  p_note        text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry_date date;
  v_is_void    boolean;
  v_closed     timestamptz;
  v_direction  text;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'So tien phai lon hon 0';
  END IF;

  SELECT entry_date, is_void INTO v_entry_date, v_is_void
  FROM public.cash_book_entries WHERE id = p_entry_id;

  IF v_entry_date IS NULL THEN
    RAISE EXCEPTION 'Khong tim thay giao dich';
  END IF;

  IF v_is_void THEN
    RAISE EXCEPTION 'Giao dich da bi huy, khong the sua';
  END IF;

  SELECT closed_at INTO v_closed
  FROM public.cash_shifts WHERE shift_date = v_entry_date;

  IF v_closed IS NOT NULL THEN
    RAISE EXCEPTION 'Ngay % da chot ca luc %. Mo lai ca truoc khi sua.',
      v_entry_date, v_closed;
  END IF;

  -- Direction suy ra tu entry_type, giong add_cash_book_entry_txn
  v_direction := CASE p_entry_type
    WHEN 'deposit_to_bank'    THEN 'out'
    WHEN 'withdraw_from_bank' THEN 'in'
    WHEN 'petty_expense'      THEN 'out'
    WHEN 'owner_withdrawal'   THEN 'out'
    WHEN 'owner_contribution' THEN 'in'
    WHEN 'other_in'           THEN 'in'
    WHEN 'other_out'          THEN 'out'
    ELSE NULL
  END;

  IF v_direction IS NULL THEN
    RAISE EXCEPTION 'Loai giao dich khong hop le: %', p_entry_type;
  END IF;

  UPDATE public.cash_book_entries SET
    entry_type  = p_entry_type,
    direction   = v_direction,
    amount      = p_amount,
    description = p_description,
    note        = p_note,
    updated_at  = now()
  WHERE id = p_entry_id;

  RETURN json_build_object(
    'id',         p_entry_id,
    'entry_date', v_entry_date,
    'direction',  v_direction,
    'entry_type', p_entry_type,
    'amount',     p_amount,
    'message',    'Da cap nhat giao dich'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_cash_book_entry_txn(uuid, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_cash_book_entry_txn(uuid, text, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_cash_book_entry_txn(uuid, text, integer, text, text) TO authenticated;

-- RPC 3: Mo lai ca da chot
CREATE OR REPLACE FUNCTION public.reopen_cash_shift_txn(
  p_shift_date date,
  p_reason     text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_closed      timestamptz;
  v_is_opening  boolean;
  v_later_count integer;
  v_old_note    text;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Phai ghi ly do mo lai ca';
  END IF;

  SELECT closed_at, is_opening_entry, note
  INTO v_closed, v_is_opening, v_old_note
  FROM public.cash_shifts WHERE shift_date = p_shift_date;

  IF v_closed IS NULL AND v_is_opening IS NULL THEN
    RAISE EXCEPTION 'Khong co ca nao ngay %', p_shift_date;
  END IF;

  IF v_closed IS NULL THEN
    RAISE EXCEPTION 'Ca ngay % chua chot, khong can mo lai.', p_shift_date;
  END IF;

  -- Khong cho mo lai neu da co ca ngay sau duoc chot,
  -- vi expected_balance cua cac ngay sau se sai theo.
  SELECT count(*) INTO v_later_count
  FROM public.cash_shifts
  WHERE shift_date > p_shift_date AND closed_at IS NOT NULL;

  IF v_later_count > 0 THEN
    RAISE EXCEPTION
      'Co % ca sau ngay % da chot. Mo lai cac ca do truoc (tu ngay moi nhat).',
      v_later_count, p_shift_date;
  END IF;

  UPDATE public.cash_shifts SET
    counted_balance  = NULL,
    expected_balance = NULL,
    closed_at        = NULL,
    closed_by        = NULL,
    note             = COALESCE(v_old_note || ' | ', '') || 'Mo lai: ' || p_reason,
    updated_at       = now()
  WHERE shift_date = p_shift_date;

  RETURN json_build_object(
    'shift_date', p_shift_date,
    'message',    'Da mo lai ca ngay ' || p_shift_date
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_cash_shift_txn(date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_cash_shift_txn(date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reopen_cash_shift_txn(date, text) TO authenticated;
