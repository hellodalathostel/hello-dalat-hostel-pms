-- Them 2 entry_type cho luong tien giua ket hostel va Hieu (owner).
-- Dong thoi rang buoc direction phai khop entry_type (fix bug RPC
-- cho phep tao 'in' + 'petty_expense' -> chi phi lam tang quy).

ALTER TABLE public.cash_book_entries
  DROP CONSTRAINT cash_book_entries_entry_type_check;

ALTER TABLE public.cash_book_entries
  ADD CONSTRAINT cash_book_entries_entry_type_check
  CHECK (entry_type = ANY (ARRAY[
    'deposit_to_bank'::text,
    'withdraw_from_bank'::text,
    'petty_expense'::text,
    'owner_withdrawal'::text,
    'owner_contribution'::text,
    'other_in'::text,
    'other_out'::text
  ]));

-- Rang buoc direction khop entry_type
ALTER TABLE public.cash_book_entries
  ADD CONSTRAINT cash_book_entries_direction_matches_type
  CHECK (
    (entry_type = 'deposit_to_bank'    AND direction = 'out') OR
    (entry_type = 'withdraw_from_bank' AND direction = 'in')  OR
    (entry_type = 'petty_expense'      AND direction = 'out') OR
    (entry_type = 'owner_withdrawal'   AND direction = 'out') OR
    (entry_type = 'owner_contribution' AND direction = 'in')  OR
    (entry_type = 'other_in'           AND direction = 'in')  OR
    (entry_type = 'other_out'          AND direction = 'out')
  );

COMMENT ON CONSTRAINT cash_book_entries_direction_matches_type
  ON public.cash_book_entries IS
  'Moi entry_type co chieu tien co dinh. Ngan tao chi phi lam tang quy hoac nguoc lai.';

COMMENT ON COLUMN public.cash_book_entries.entry_type IS
  'owner_withdrawal = tien ra khoi ket ve tay Hieu (gop ca truong hop Loi giao tien va Hieu rut tieu rieng - ghi ro muc dich vao description). owner_contribution = Hieu bo tien vao ket.';

-- RPC tu suy ra direction, khong de frontend truyen sai
CREATE OR REPLACE FUNCTION public.add_cash_book_entry_txn(
  p_direction   text,
  p_entry_type  text,
  p_amount      integer,
  p_description text,
  p_entry_date  date DEFAULT CURRENT_DATE,
  p_note        text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id        uuid;
  v_closed    timestamptz;
  v_open_date date;
  v_direction text;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'So tien phai lon hon 0';
  END IF;

  -- Suy ra direction tu entry_type. Giu p_direction trong signature
  -- de khong pha frontend hien co, nhung chi dung de doi chieu.
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

  IF p_direction IS NOT NULL AND p_direction <> v_direction THEN
    RAISE EXCEPTION 'Loai "%" luon la chieu "%", khong the ghi la "%".',
      p_entry_type, v_direction, p_direction;
  END IF;

  -- Khong cho ghi truoc ngay khai so
  SELECT shift_date INTO v_open_date
  FROM public.cash_shifts WHERE is_opening_entry = true LIMIT 1;

  IF v_open_date IS NOT NULL AND p_entry_date < v_open_date THEN
    RAISE EXCEPTION 'Khong the ghi giao dich ngay % vi truoc ngay khai so %.',
      p_entry_date, v_open_date;
  END IF;

  -- Khong cho ghi vao ngay da chot ca
  SELECT closed_at INTO v_closed
  FROM public.cash_shifts WHERE shift_date = p_entry_date;

  IF v_closed IS NOT NULL THEN
    RAISE EXCEPTION 'Ngay % da chot ca luc %. Khong the them giao dich.', p_entry_date, v_closed;
  END IF;

  INSERT INTO public.cash_book_entries (
    entry_date, direction, entry_type, amount, description, note, created_by
  ) VALUES (
    p_entry_date, v_direction, p_entry_type, p_amount, p_description, p_note, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'id',         v_id,
    'entry_date', p_entry_date,
    'direction',  v_direction,
    'entry_type', p_entry_type,
    'amount',     p_amount
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.add_cash_book_entry_txn(text, text, integer, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_cash_book_entry_txn(text, text, integer, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_cash_book_entry_txn(text, text, integer, text, date, text) TO authenticated;
