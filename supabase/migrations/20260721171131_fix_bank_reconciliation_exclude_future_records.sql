-- Fix: expenses co ban ghi ngay tuong lai (vd cuoc Internet thang sau ghi truoc)
-- -> lot vao doi chieu va bao lech gia moi ngay cho toi khi thanh toan that.
-- Chi doi chieu den hom nay (gio VN).
CREATE OR REPLACE VIEW public.bank_reconciliation
WITH (security_invoker = true) AS
WITH moc AS (
  SELECT
    (SELECT MIN(txn_date) FROM public.bank_book_detail) AS tu_ngay,
    (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date       AS den_ngay
),
bank_thu AS (
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
  SELECT p.id, p.date, p.amount, p.method::text AS method
  FROM public.payment_history p, moc
  WHERE p.method IN ('transfer','other')
    AND COALESCE(p.is_void,false) = false
    AND p.date <= moc.den_ngay
),
pms_chi AS (
  SELECT e.id, e.date, e.amount, e.description,
         COALESCE(e.payment_method::text,'(chua ro)') AS pm
  FROM public.expenses e, moc
  WHERE COALESCE(e.is_deleted,false) = false
    AND (e.payment_method IS NULL OR e.payment_method::text <> 'cash')
    AND e.date <= moc.den_ngay
)
SELECT 'thu: bank co, PMS thieu'::text AS van_de, b.txn_date AS ngay,
       b.amount, b.account_no, b.merchant AS mo_ta
FROM bank_thu b
WHERE NOT EXISTS (
  SELECT 1 FROM pms_thu p
  WHERE p.amount = b.amount AND p.date BETWEEN b.txn_date - 1 AND b.txn_date + 1)

UNION ALL
SELECT 'thu: PMS co, bank thieu', p.date, p.amount, NULL, p.method
FROM pms_thu p, moc
WHERE p.date >= moc.tu_ngay
  AND NOT EXISTS (
    SELECT 1 FROM bank_thu b
    WHERE b.amount = p.amount AND b.txn_date BETWEEN p.date - 1 AND p.date + 1)

UNION ALL
SELECT 'chi: bank co, PMS thieu', b.txn_date, b.amount, b.account_no, b.merchant
FROM bank_chi b
WHERE NOT EXISTS (
  SELECT 1 FROM pms_chi e
  WHERE e.amount = b.amount AND e.date BETWEEN b.txn_date - 1 AND b.txn_date + 1)

UNION ALL
SELECT 'chi: PMS co, bank thieu', e.date, e.amount, NULL,
       COALESCE(e.description,'') || ' [' || e.pm || ']'
FROM pms_chi e, moc
WHERE e.date >= moc.tu_ngay
  AND NOT EXISTS (
    SELECT 1 FROM bank_chi b
    WHERE b.amount = e.amount AND b.txn_date BETWEEN e.date - 1 AND e.date + 1);

COMMENT ON VIEW public.bank_reconciliation IS
  'Chi ra tung dong lech giua so ngan hang va PMS. Khop theo so tien + ngay +/-1. '
  'Chi doi chieu den hom nay - ban ghi ngay tuong lai (vd hoa don thang sau ghi truoc) bi loai. '
  'Chenh lech nho (phi CK) hien thanh 2 dong o ca 2 phia, can doi chieu bang mat.';

GRANT SELECT ON public.bank_reconciliation TO anon, authenticated;
