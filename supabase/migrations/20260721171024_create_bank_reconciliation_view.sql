-- Doi chieu so ngan hang <-> PMS. Khop theo (so tien, ngay +/- 1) vi app bank
-- khong hien ma GD nen khong co khoa chung voi payment_history/expenses.
-- thu_the_mpos KHONG doi chieu 1-1 (ve tre + gop nhieu GD) -> loai khoi view nay,
-- xem rieng o bank_mpos_reconciliation.
CREATE OR REPLACE VIEW public.bank_reconciliation
WITH (security_invoker = true) AS
WITH bank_thu AS (
  SELECT id, account_no, txn_date, amount, merchant
  FROM public.bank_book_detail
  WHERE txn_kind = 'thu_that' AND direction = 'in'
),
bank_chi AS (
  SELECT id, account_no, txn_date, amount, merchant
  FROM public.bank_book_detail
  WHERE txn_kind = 'chi_that' AND direction = 'out'
),
pms_thu AS (
  SELECT id, date, amount, method::text AS method
  FROM public.payment_history
  WHERE method IN ('transfer','other')
    AND COALESCE(is_void,false) = false
),
pms_chi AS (
  SELECT id, date, amount, description, COALESCE(payment_method::text,'(chua ro)') AS pm
  FROM public.expenses
  WHERE COALESCE(is_deleted,false) = false
    AND (payment_method IS NULL OR payment_method::text <> 'cash')
)
-- Tien ve TK nhung PMS chua ghi -> nghi thieu payment
SELECT 'thu: bank co, PMS thieu'::text AS van_de, b.txn_date AS ngay,
       b.amount, b.account_no, b.merchant AS mo_ta
FROM bank_thu b
WHERE NOT EXISTS (
  SELECT 1 FROM pms_thu p
  WHERE p.amount = b.amount AND p.date BETWEEN b.txn_date - 1 AND b.txn_date + 1)

UNION ALL
-- PMS ghi thu nhung khong thay tien ve -> nghi ghi nham hoac tien chua ve
SELECT 'thu: PMS co, bank thieu', p.date, p.amount, NULL, p.method
FROM pms_thu p
WHERE p.date >= (SELECT MIN(txn_date) FROM public.bank_book_detail)
  AND NOT EXISTS (
    SELECT 1 FROM bank_thu b
    WHERE b.amount = p.amount AND b.txn_date BETWEEN p.date - 1 AND p.date + 1)

UNION ALL
-- Tien ra khoi TK nhung chua ghi chi phi -> thieu expenses
SELECT 'chi: bank co, PMS thieu', b.txn_date, b.amount, b.account_no, b.merchant
FROM bank_chi b
WHERE NOT EXISTS (
  SELECT 1 FROM pms_chi e
  WHERE e.amount = b.amount AND e.date BETWEEN b.txn_date - 1 AND b.txn_date + 1)

UNION ALL
-- Ghi chi phi nhung khong thay tien ra
SELECT 'chi: PMS co, bank thieu', e.date, e.amount, NULL, COALESCE(e.description,'') || ' [' || e.pm || ']'
FROM pms_chi e
WHERE e.date >= (SELECT MIN(txn_date) FROM public.bank_book_detail)
  AND NOT EXISTS (
    SELECT 1 FROM bank_chi b
    WHERE b.amount = e.amount AND b.txn_date BETWEEN e.date - 1 AND e.date + 1);

COMMENT ON VIEW public.bank_reconciliation IS
  'Chi ra tung dong lech giua so ngan hang va PMS. Khop theo so tien + ngay +/-1. '
  'Chenh lech nho (phi CK) se hien thanh 2 dong o ca 2 phia - can doi chieu bang mat.';

-- mPOS: doi chieu TONG DON, khong theo dong.
CREATE OR REPLACE VIEW public.bank_mpos_reconciliation
WITH (security_invoker = true) AS
SELECT
  (SELECT COALESCE(SUM(amount),0) FROM public.bank_book_detail
    WHERE txn_kind='thu_the_mpos')                          AS tong_tien_the_da_ve,
  (SELECT COALESCE(SUM(amount),0) FROM public.payment_history
    WHERE method='card' AND COALESCE(is_void,false)=false
      AND date >= (SELECT MIN(txn_date) FROM public.bank_book_detail)) AS tong_khach_quet_the,
  (SELECT COALESCE(SUM(amount),0) FROM public.payment_history
    WHERE method='card' AND COALESCE(is_void,false)=false
      AND date >= (SELECT MIN(txn_date) FROM public.bank_book_detail))
  - (SELECT COALESCE(SUM(amount),0) FROM public.bank_book_detail
    WHERE txn_kind='thu_the_mpos')                          AS con_cho_ve;

COMMENT ON VIEW public.bank_mpos_reconciliation IS
  'Tien the mPOS ve tre va gop nhieu GD -> doi chieu tong don. con_cho_ve > 0 la binh thuong (chua chuyen), < 0 la co van de.';

GRANT SELECT ON public.bank_reconciliation      TO anon, authenticated;
GRANT SELECT ON public.bank_mpos_reconciliation TO anon, authenticated;
