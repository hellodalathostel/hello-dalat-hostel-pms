-- Huong A: opening_balance = ton dau ngay (0h00), chuan ke toan.
-- RPC tu tru giao dich tien mat da phat sinh trong ngay khai so.
-- Tach moc khai so khoi viec chot ca, de ngay khai van chot duoc.

DROP FUNCTION IF EXISTS public.open_cash_book_txn(date, integer, text);

CREATE OR REPLACE FUNCTION public.open_cash_book_txn(
  p_open_date        date,
  p_counted_balance  integer,
  p_note             text    DEFAULT NULL,
  p_counted_at_open  boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_open   date;
  v_net_today       integer;
  v_opening_balance integer;
BEGIN
  IF p_counted_balance < 0 THEN
    RAISE EXCEPTION 'So tien dem duoc khong the am';
  END IF;

  SELECT shift_date INTO v_existing_open
  FROM public.cash_shifts WHERE is_opening_entry = true LIMIT 1;

  IF v_existing_open IS NOT NULL AND v_existing_open <> p_open_date THEN
    RAISE EXCEPTION 'So quy da duoc khai vao ngay %. Xoa moc cu truoc khi khai lai.', v_existing_open;
  END IF;

  IF p_counted_at_open THEN
    -- So nhap vao la ton DEM DUOC tai thoi diem khai (giua ngay).
    -- Tru nguoc giao dich tien mat trong ngay de ra ton dau ngay.
    SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)::integer
    INTO v_net_today
    FROM public.cash_book_detail
    WHERE entry_date = p_open_date;

    v_opening_balance := p_counted_balance - v_net_today;
  ELSE
    v_net_today       := 0;
    v_opening_balance := p_counted_balance;
  END IF;

  IF v_opening_balance < 0 THEN
    RAISE EXCEPTION
      'Ton dau ngay tinh ra am (%). Dem duoc % nhung giao dich trong ngay da la %. Kiem tra lai so dem hoac du lieu giao dich.',
      v_opening_balance, p_counted_balance, v_net_today;
  END IF;

  -- Moc khai so: KHONG set closed_at/counted_balance/expected_balance,
  -- de ngay do van chot ca that duoc vao cuoi ngay.
  INSERT INTO public.cash_shifts (
    shift_date, opening_balance, is_opening_entry, note
  ) VALUES (
    p_open_date, v_opening_balance, true,
    COALESCE(p_note, 'Khai so quy tien mat')
  )
  ON CONFLICT (shift_date) DO UPDATE SET
    opening_balance  = EXCLUDED.opening_balance,
    is_opening_entry = true,
    counted_balance  = NULL,
    expected_balance = NULL,
    closed_at        = NULL,
    closed_by        = NULL,
    note             = EXCLUDED.note,
    updated_at       = now();

  RETURN json_build_object(
    'open_date',        p_open_date,
    'counted_balance',  p_counted_balance,
    'net_today',        v_net_today,
    'opening_balance',  v_opening_balance,
    'message',          'Da khai so quy tien mat (ton dau ngay = ' || v_opening_balance || ')'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.open_cash_book_txn(date, integer, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_cash_book_txn(date, integer, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_cash_book_txn(date, integer, text, boolean) TO authenticated;

-- RPC chot ca hang ngay
CREATE OR REPLACE FUNCTION public.close_cash_shift_txn(
  p_shift_date       date,
  p_counted_balance  integer,
  p_note             text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_open_date        date;
  v_opening_balance  integer;
  v_expected         integer;
  v_discrepancy      integer;
BEGIN
  IF p_counted_balance < 0 THEN
    RAISE EXCEPTION 'So tien dem duoc khong the am';
  END IF;

  SELECT shift_date, opening_balance INTO v_open_date, v_opening_balance
  FROM public.cash_shifts WHERE is_opening_entry = true LIMIT 1;

  IF v_open_date IS NULL THEN
    RAISE EXCEPTION 'Chua khai so quy. Goi open_cash_book_txn truoc.';
  END IF;

  IF p_shift_date < v_open_date THEN
    RAISE EXCEPTION 'Khong the chot ca ngay % vi truoc ngay khai so %.', p_shift_date, v_open_date;
  END IF;

  -- Ton ky vong = ton dau ky + thuan tien mat tu ngay khai so den het ngay chot
  SELECT (v_opening_balance
          + COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0))::integer
  INTO v_expected
  FROM public.cash_book_detail
  WHERE entry_date >= v_open_date AND entry_date <= p_shift_date;

  v_discrepancy := p_counted_balance - v_expected;

  INSERT INTO public.cash_shifts (
    shift_date, opening_balance, counted_balance, expected_balance,
    closed_at, closed_by, note
  ) VALUES (
    p_shift_date, 0, p_counted_balance, v_expected,
    now(), auth.uid(), p_note
  )
  ON CONFLICT (shift_date) DO UPDATE SET
    counted_balance  = EXCLUDED.counted_balance,
    expected_balance = EXCLUDED.expected_balance,
    closed_at        = now(),
    closed_by        = auth.uid(),
    note             = COALESCE(EXCLUDED.note, public.cash_shifts.note),
    updated_at       = now();

  RETURN json_build_object(
    'shift_date',       p_shift_date,
    'counted_balance',  p_counted_balance,
    'expected_balance', v_expected,
    'discrepancy',      v_discrepancy,
    'message', CASE
      WHEN v_discrepancy = 0 THEN 'Chot ca khop, khong lech'
      WHEN v_discrepancy > 0 THEN 'Chot ca: thua ' || v_discrepancy || ' d'
      ELSE 'Chot ca: thieu ' || abs(v_discrepancy) || ' d'
    END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.close_cash_shift_txn(date, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_shift_txn(date, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_cash_shift_txn(date, integer, text) TO authenticated;
