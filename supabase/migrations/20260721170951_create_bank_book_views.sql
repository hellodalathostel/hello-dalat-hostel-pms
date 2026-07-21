-- So ngan hang chinh thuc: chi GD tu sau moc khai so, da duyet, khong phai lich su dau ky.
-- brain schema khong expose qua PostgREST -> view dat o public de frontend doc duoc.
CREATE OR REPLACE VIEW public.bank_book_detail
WITH (security_invoker = true) AS
SELECT
  bs.id,
  bs.account_no,
  ba.ten_hien_thi        AS ten_tk,
  bs.txn_date,
  bs.txn_datetime,
  bs.direction,
  bs.amount,
  bs.balance_after,
  bs.txn_kind,
  bs.merchant,
  bs.reference_no,
  bs.counterpart_account,
  bs.wallet,
  bs.note,
  bs.status,
  -- Chi thu_that/chi_that/thu_the_mpos moi anh huong ket qua kinh doanh.
  -- noi_bo, nap_nguon, ca_nhan chi lam thay doi so du, khong phai thu/chi that.
  (bs.txn_kind IN ('thu_that','chi_that','thu_the_mpos')) AS tinh_vao_kqkd
FROM brain.bank_statements bs
JOIN public.bank_accounts ba ON ba.account_no = bs.account_no
WHERE bs.is_opening_history = false
  AND bs.status = 'da_duyet'
  AND bs.txn_datetime > ba.opening_at;

COMMENT ON VIEW public.bank_book_detail IS
  'So ngan hang chinh thuc tu moc khai (21/07/2026). Loc bo lich su dau ky va GD chua duyet.';

-- Tong hop theo ngay + tai khoan
CREATE OR REPLACE VIEW public.bank_book_daily
WITH (security_invoker = true) AS
SELECT
  account_no,
  ten_tk,
  txn_date,
  COUNT(*)                                                              AS so_gd,
  SUM(amount) FILTER (WHERE direction='in'  AND tinh_vao_kqkd)          AS thu_that,
  SUM(amount) FILTER (WHERE direction='out' AND tinh_vao_kqkd)          AS chi_that,
  SUM(amount) FILTER (WHERE txn_kind='noi_bo')                          AS noi_bo,
  SUM(amount) FILTER (WHERE txn_kind='nap_nguon')                       AS nap_nguon,
  SUM(amount) FILTER (WHERE txn_kind='ca_nhan')                         AS ca_nhan,
  SUM(amount) FILTER (WHERE txn_kind='thu_the_mpos')                    AS thu_the_mpos,
  COUNT(*) FILTER (WHERE txn_kind='chua_phan_loai')                     AS chua_phan_loai,
  MAX(balance_after)                                                    AS so_du_cuoi_doc_duoc
FROM public.bank_book_detail
GROUP BY account_no, ten_tk, txn_date;

COMMENT ON VIEW public.bank_book_daily IS
  'Gop so ngan hang theo ngay/TK. so_du_cuoi_doc_duoc lay MAX(balance_after), co the NULL neu GD do khong doc duoc so du.';

GRANT SELECT ON public.bank_book_detail TO anon, authenticated;
GRANT SELECT ON public.bank_book_daily  TO anon, authenticated;
