-- Bo sung 2 loai GD phat hien khi doi chieu sao ke that 19-21/07:
--   ca_nhan      = tien ca nhan di qua TK hostel (vd ba chuyen tien mua BHYT).
--                  Ghi de so du khop, loai khoi doi chieu doanh thu/chi phi.
--   thu_the_mpos = khach quet the tai hostel qua mPOS. Tien ve TK chu ho kinh doanh (ba),
--                  ba chuyen lai -> ve TRE va GOP nhieu GD. Doi chieu theo TONG DON
--                  voi payment_history.method='card', KHONG doi chieu 1-1 tung dong.
ALTER TABLE brain.bank_statements
  DROP CONSTRAINT IF EXISTS bank_statements_kind_check,
  ADD  CONSTRAINT bank_statements_kind_check
    CHECK (txn_kind IN (
      'thu_that','chi_that','noi_bo','nap_nguon',
      'ca_nhan','thu_the_mpos','chua_phan_loai'
    ));

COMMENT ON COLUMN brain.bank_statements.txn_kind IS
  'Nguoi phan loai luc duyet, khong suy tu account_no duoc (chi phi tra lan lon ca 2 TK). '
  'thu_that/chi_that = doi chieu 1-1 voi payment_history/expenses. '
  'noi_bo = gom giua 2 TK. '
  'nap_nguon = nap vi/tra sao ke the, chi that nam o tang vi (public.expenses). '
  'ca_nhan = tien ca nhan di qua TK hostel, loai khoi moi doi chieu nghiep vu. '
  'thu_the_mpos = tien khach quet the ve qua TK chu ho kinh doanh, doi chieu theo TONG DON.';
