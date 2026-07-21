-- Fix bat doi xung cua so thoi gian:
--   Truoc: bank loc theo opening_at, PMS loc theo MIN(txn_date) cua so
--   -> ban ghi PMS truoc moc khai bao lech gia (vd payment 21/07 sang, moc khai 21/07 13:57).
-- Sau: ca 2 phia dung chung cua so [moc khai som nhat .. hom nay].
-- Cung chan GD bank ghi ngay tuong lai (chup luc 23h50, NH ghi sang ngay hom sau).
CREATE OR REPLACE VIEW public.bank_reconciliation
WITH (security_invoker = true) AS
WITH moc AS (
  SELECT
    MIN(opening_at)                                 AS tu_luc,
    MIN(opening_at)::date                           AS tu_ngay,
    (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date   AS den_ngay
  FROM public.bank_accounts WHERE is_active
),
bank_thu AS (
  SELECT b.id, b.account_no, b.txn_date, b.amount, b.merchant
  FROM public.bank_book_detail b, moc
  WHERE b.txn_kind = 'thu_that' AND b.direction = 'in'
    AND b.txn_date <= moc.den_ngay
),
bank_chi AS (
  SELECT b.id, b.account_no, b.txn_date, b.amount, b.merchant
  FROM public.bank_book_detail b, moc
  WHERE b.txn_kind = 'chi_that' AND b.direction = 'out'
    AND b.txn_date <= moc.den_ngay
),
pms_thu AS (
  SELECT p.id, p.date, p.amount, p.method::text AS method
  FROM public.payment_history p, moc
  WHERE p.method IN ('transfer','other')
    AND COALESCE(p.is_void,false) = false
    AND p.created_at >= moc.tu_luc
    AND p.date <= moc.den_ngay
),
pms_chi AS (
  SELECT e.id, e.date, e.amount, e.description,
         COALESCE(e.payment_method::text,'(chua ro)') AS pm
  FROM public.expenses e, moc
  WHERE COALESCE(e.is_deleted,false) = false
    AND (e.payment_method IS NULL OR e.payment_method::text <> 'cash')
    AND e.created_at >= moc.tu_luc
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
FROM pms_thu p
WHERE NOT EXISTS (
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
FROM pms_chi e
WHERE NOT EXISTS (
  SELECT 1 FROM bank_chi b
  WHERE b.amount = e.amount AND b.txn_date BETWEEN e.date - 1 AND e.date + 1);

COMMENT ON VIEW public.bank_reconciliation IS
  'Doi chieu so ngan hang <-> PMS trong cua so [moc khai so .. hom nay], doi xung ca 2 phia. '
  'Loc PMS theo created_at (khong phai date) de ban ghi nhap truoc moc khai khong bao lech gia. '
  'Khop theo so tien + ngay +/-1 vi app bank khong hien ma GD. '
  'Chenh lech nho (phi CK, vd 170000 vs 169650) hien thanh 2 dong o ca 2 phia - can doi chieu bang mat.';

GRANT SELECT ON public.bank_reconciliation TO anon, authenticated;
