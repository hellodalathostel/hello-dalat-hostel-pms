-- View tong hop theo ngay: ton dau -> thu -> chi -> ton cuoi
-- Ton luy ke tinh TU NGAY KHAI SO (is_opening_entry=true), bo qua lich su truoc do

CREATE OR REPLACE VIEW public.cash_book_daily
WITH (security_invoker = true)
AS
WITH opening AS (
  -- Moc khai so do Owner an dinh
  SELECT shift_date AS open_date, opening_balance
  FROM public.cash_shifts
  WHERE is_opening_entry = true
  ORDER BY shift_date DESC
  LIMIT 1
),
daily AS (
  SELECT
    d.entry_date,
    SUM(d.amount) FILTER (WHERE d.direction='in')  AS thu_trong_ngay,
    SUM(d.amount) FILTER (WHERE d.direction='out') AS chi_trong_ngay,
    COUNT(*)                                        AS so_giao_dich
  FROM public.cash_book_detail d
  WHERE d.entry_date >= COALESCE((SELECT open_date FROM opening), d.entry_date)
  GROUP BY d.entry_date
)
SELECT
  d.entry_date,
  COALESCE(d.thu_trong_ngay, 0)::integer  AS thu_trong_ngay,
  COALESCE(d.chi_trong_ngay, 0)::integer  AS chi_trong_ngay,
  (COALESCE(d.thu_trong_ngay,0) - COALESCE(d.chi_trong_ngay,0))::integer AS thuan_trong_ngay,
  d.so_giao_dich,
  -- Ton luy ke = ton khai so + tong thuan tu ngay khai so den ngay nay
  (COALESCE((SELECT opening_balance FROM opening), 0)
    + SUM(COALESCE(d.thu_trong_ngay,0) - COALESCE(d.chi_trong_ngay,0))
      OVER (ORDER BY d.entry_date)
  )::integer AS ton_luy_ke,
  cs.opening_balance,
  cs.counted_balance,
  cs.expected_balance,
  cs.discrepancy,
  cs.closed_at,
  cs.is_opening_entry
FROM daily d
LEFT JOIN public.cash_shifts cs ON cs.shift_date = d.entry_date;

GRANT SELECT ON public.cash_book_daily TO authenticated;
REVOKE ALL ON public.cash_book_daily FROM anon;
REVOKE ALL ON public.cash_book_daily FROM PUBLIC;

-- ===== RPC 1: Khai so - Owner an dinh ton dau ky =====
CREATE OR REPLACE FUNCTION public.open_cash_book_txn(
  p_open_date       date,
  p_opening_balance integer,
  p_note            text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing_open date;
BEGIN
  IF p_opening_balance < 0 THEN
    RAISE EXCEPTION 'Ton dau ky khong the am';
  END IF;

  SELECT shift_date INTO v_existing_open
  FROM public.cash_shifts WHERE is_opening_entry = true LIMIT 1;

  IF v_existing_open IS NOT NULL AND v_existing_open <> p_open_date THEN
    RAISE EXCEPTION 'So quy da duoc khai vao ngay %. Xoa moc cu truoc khi khai lai.', v_existing_open;
  END IF;

  INSERT INTO public.cash_shifts (
    shift_date, opening_balance, counted_balance, expected_balance,
    is_opening_entry, closed_at, closed_by, note
  ) VALUES (
    p_open_date, p_opening_balance, p_opening_balance, p_opening_balance,
    true, now(), auth.uid(), COALESCE(p_note, 'Khai so quy tien mat')
  )
  ON CONFLICT (shift_date) DO UPDATE SET
    opening_balance  = EXCLUDED.opening_balance,
    counted_balance  = EXCLUDED.counted_balance,
    expected_balance = EXCLUDED.expected_balance,
    is_opening_entry = true,
    closed_at        = now(),
    closed_by        = auth.uid(),
    note             = EXCLUDED.note,
    updated_at       = now();

  RETURN json_build_object(
    'open_date', p_open_date,
    'opening_balance', p_opening_balance,
    'message', 'Da khai so quy tien mat'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.open_cash_book_txn(date, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_cash_book_txn(date, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_cash_book_txn(date, integer, text) TO authenticated;

-- ===== RPC 2: Chot ca cuoi ngay =====
CREATE OR REPLACE FUNCTION public.close_cash_shift_txn(
  p_shift_date      date,
  p_counted_balance integer,
  p_note            text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_opening  integer;
  v_thu      integer;
  v_chi      integer;
  v_expected integer;
  v_open_date date;
BEGIN
  IF p_counted_balance < 0 THEN
    RAISE EXCEPTION 'So tien dem duoc khong the am';
  END IF;

  SELECT shift_date INTO v_open_date
  FROM public.cash_shifts WHERE is_opening_entry = true LIMIT 1;

  IF v_open_date IS NULL THEN
    RAISE EXCEPTION 'Chua khai so quy. Goi open_cash_book_txn truoc.';
  END IF;

  IF p_shift_date <= v_open_date THEN
    RAISE EXCEPTION 'Ngay chot ca phai sau ngay khai so (%)', v_open_date;
  END IF;

  -- Khoa ban ghi ngay chot gan nhat de tranh race
  PERFORM 1 FROM public.cash_shifts
  WHERE shift_date < p_shift_date AND closed_at IS NOT NULL
  ORDER BY shift_date DESC LIMIT 1 FOR UPDATE;

  -- Ton dau = ton cuoi cua ngay chot gan nhat truoc do
  SELECT COALESCE(counted_balance, expected_balance) INTO v_opening
  FROM public.cash_shifts
  WHERE shift_date < p_shift_date AND closed_at IS NOT NULL
  ORDER BY shift_date DESC LIMIT 1;

  IF v_opening IS NULL THEN
    RAISE EXCEPTION 'Khong tim thay ngay chot truoc do. Chot ca theo thu tu ngay.';
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE direction='in'), 0),
    COALESCE(SUM(amount) FILTER (WHERE direction='out'), 0)
  INTO v_thu, v_chi
  FROM public.cash_book_detail WHERE entry_date = p_shift_date;

  v_expected := v_opening + v_thu - v_chi;

  INSERT INTO public.cash_shifts (
    shift_date, opening_balance, counted_balance, expected_balance,
    is_opening_entry, closed_at, closed_by, note
  ) VALUES (
    p_shift_date, v_opening, p_counted_balance, v_expected,
    false, now(), auth.uid(), p_note
  )
  ON CONFLICT (shift_date) DO UPDATE SET
    opening_balance  = EXCLUDED.opening_balance,
    counted_balance  = EXCLUDED.counted_balance,
    expected_balance = EXCLUDED.expected_balance,
    closed_at        = now(),
    closed_by        = auth.uid(),
    note             = EXCLUDED.note,
    updated_at       = now();

  RETURN json_build_object(
    'shift_date', p_shift_date,
    'opening_balance', v_opening,
    'thu_trong_ngay', v_thu,
    'chi_trong_ngay', v_chi,
    'expected_balance', v_expected,
    'counted_balance', p_counted_balance,
    'discrepancy', p_counted_balance - v_expected
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_shift_txn(date, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_shift_txn(date, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_cash_shift_txn(date, integer, text) TO authenticated;

-- ===== RPC 3: Ghi giao dich quy thu cong =====
CREATE OR REPLACE FUNCTION public.add_cash_book_entry_txn(
  p_direction   text,
  p_entry_type  text,
  p_amount      integer,
  p_description text,
  p_entry_date  date DEFAULT CURRENT_DATE,
  p_note        text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_closed timestamptz;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'So tien phai lon hon 0';
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
    p_entry_date, p_direction, p_entry_type, p_amount, p_description, p_note, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('id', v_id, 'entry_date', p_entry_date, 'amount', p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.add_cash_book_entry_txn(text, text, integer, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_cash_book_entry_txn(text, text, integer, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_cash_book_entry_txn(text, text, integer, text, date, text) TO authenticated;