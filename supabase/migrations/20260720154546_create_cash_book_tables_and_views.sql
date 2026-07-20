-- So quy tien mat + giao ca (cash book, cash basis)
-- Khac daily_revenue (accrual): chi ghi tien mat VAT LY qua ket
-- Ton dau ky do Owner an dinh (open_cash_book_txn), sau do la chuoi lien tuc

CREATE TABLE IF NOT EXISTS public.cash_book_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date    date        NOT NULL DEFAULT CURRENT_DATE,
  direction     text        NOT NULL CHECK (direction IN ('in','out')),
  entry_type    text        NOT NULL CHECK (entry_type IN
                  ('deposit_to_bank','withdraw_from_bank','petty_expense','other_in','other_out')),
  amount        integer     NOT NULL CHECK (amount > 0),
  description   text        NOT NULL,
  expense_id    uuid        REFERENCES public.expenses(id) ON DELETE SET NULL,
  note          text,
  created_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_book_entries_date ON public.cash_book_entries(entry_date);

ALTER TABLE public.cash_book_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_book_entries_all ON public.cash_book_entries;
CREATE POLICY cash_book_entries_all ON public.cash_book_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_book_entries TO authenticated;
REVOKE ALL ON public.cash_book_entries FROM anon;
REVOKE ALL ON public.cash_book_entries FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.cash_shifts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date        date        NOT NULL UNIQUE,
  opening_balance   integer     NOT NULL,
  counted_balance   integer,
  expected_balance  integer,
  discrepancy       integer GENERATED ALWAYS AS
                      (COALESCE(counted_balance,0) - COALESCE(expected_balance,0)) STORED,
  is_opening_entry  boolean     NOT NULL DEFAULT false,
  closed_at         timestamptz,
  closed_by         uuid        REFERENCES auth.users(id),
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_date ON public.cash_shifts(shift_date DESC);

ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_shifts_all ON public.cash_shifts;
CREATE POLICY cash_shifts_all ON public.cash_shifts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_shifts TO authenticated;
REVOKE ALL ON public.cash_shifts FROM anon;
REVOKE ALL ON public.cash_shifts FROM PUBLIC;

CREATE OR REPLACE VIEW public.cash_book_detail
WITH (security_invoker = true)
AS
SELECT
  ph.date               AS entry_date,
  'in'::text            AS direction,
  'guest_payment'::text AS entry_type,
  ph.amount,
  COALESCE('Thu khach - ' || g.customer_name, 'Thu khach') AS description,
  ph.id                 AS ref_id,
  'payment_history'::text AS ref_table,
  ph.created_at
FROM payment_history ph
LEFT JOIN groups g ON g.id = ph.group_id
WHERE ph.is_void = false AND ph.method = 'cash'::payment_method

UNION ALL

SELECT
  e.date, 'out', 'expense', e.amount,
  COALESCE(e.category::text || ' - ' || e.description, e.category::text),
  e.id, 'expenses', e.created_at
FROM expenses e
WHERE e.payment_method = 'cash'::payment_method

UNION ALL

SELECT
  pt.transaction_date,
  CASE WHEN pt.direction = 'collected' THEN 'in' ELSE 'out' END,
  'pass_through', pt.amount,
  'Thu chi ho - ' || COALESCE(pt.partner_name, ''),
  pt.id, 'pass_through_transactions', pt.created_at
FROM pass_through_transactions pt
WHERE pt.payment_method = 'cash'

UNION ALL

SELECT
  cb.entry_date, cb.direction, cb.entry_type, cb.amount,
  cb.description, cb.id, 'cash_book_entries', cb.created_at
FROM cash_book_entries cb;

GRANT SELECT ON public.cash_book_detail TO authenticated;
REVOKE ALL ON public.cash_book_detail FROM anon;
REVOKE ALL ON public.cash_book_detail FROM PUBLIC;