-- Mo rong brain.bank_statements thanh ve doi chieu sao ke ngan hang.
-- Nguon nhap: OCR anh danh sach GD tu app bank (email sync da chet - NH khong con gui email).
-- 2 tai khoan: 9969975935 (khach CK ve, chi phi) | 1014095502 (nguon vi dien tu/the TD/GPay).
-- Khong suy duoc ban chat GD tu account_no -> txn_kind do nguoi phan loai luc duyet.

-- Index cu (bank, txn_date, amount, reference_no) thieu account_no/direction/balance_after
-- -> chan nham cap gom noi bo 2 TK cung so tien cung ngay. Thay bang index moi.
DROP INDEX IF EXISTS brain.idx_bank_stmt_unique;

ALTER TABLE brain.bank_statements
  ADD COLUMN IF NOT EXISTS direction     text NOT NULL DEFAULT 'out',
  ADD COLUMN IF NOT EXISTS balance_after numeric,
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'cho_duyet',
  ADD COLUMN IF NOT EXISTS txn_kind      text NOT NULL DEFAULT 'chua_phan_loai',
  ADD COLUMN IF NOT EXISTS account_no    text,
  ADD COLUMN IF NOT EXISTS counterpart_account text,
  ADD COLUMN IF NOT EXISTS wallet        text,
  ADD COLUMN IF NOT EXISTS note          text,
  ADD COLUMN IF NOT EXISTS approved_at   timestamptz;

UPDATE brain.bank_statements SET account_no = '9969975935' WHERE account_no IS NULL;
ALTER TABLE brain.bank_statements ALTER COLUMN account_no SET NOT NULL;

ALTER TABLE brain.bank_statements
  DROP CONSTRAINT IF EXISTS bank_statements_direction_check,
  ADD  CONSTRAINT bank_statements_direction_check CHECK (direction IN ('in','out'));

ALTER TABLE brain.bank_statements
  DROP CONSTRAINT IF EXISTS bank_statements_status_check,
  ADD  CONSTRAINT bank_statements_status_check
    CHECK (status IN ('cho_duyet','da_duyet','bo_qua'));

ALTER TABLE brain.bank_statements
  DROP CONSTRAINT IF EXISTS bank_statements_kind_check,
  ADD  CONSTRAINT bank_statements_kind_check
    CHECK (txn_kind IN ('thu_that','chi_that','noi_bo','nap_nguon','chua_phan_loai'));

-- Them TK moi -> sua constraint nay (va ca kind_detail_check ben duoi)
ALTER TABLE brain.bank_statements
  DROP CONSTRAINT IF EXISTS bank_statements_account_check,
  ADD  CONSTRAINT bank_statements_account_check
    CHECK (account_no IN ('9969975935','1014095502'));

ALTER TABLE brain.bank_statements
  DROP CONSTRAINT IF EXISTS bank_statements_kind_detail_check,
  ADD  CONSTRAINT bank_statements_kind_detail_check CHECK (
    CASE txn_kind
      WHEN 'noi_bo' THEN
        counterpart_account IS NOT NULL
        AND counterpart_account <> account_no
        AND counterpart_account IN ('9969975935','1014095502')
        AND wallet IS NULL
      WHEN 'nap_nguon' THEN
        wallet IS NOT NULL AND counterpart_account IS NULL
      ELSE
        counterpart_account IS NULL AND wallet IS NULL
    END
  );

-- Khong the lo tay duyet ca lo khi chua phan loai
ALTER TABLE brain.bank_statements
  DROP CONSTRAINT IF EXISTS bank_statements_approve_check,
  ADD  CONSTRAINT bank_statements_approve_check
    CHECK (NOT (status = 'da_duyet' AND txn_kind = 'chua_phan_loai'));

-- balance_after la thanh phan phan biet 2 GD giong het nhau trong ngay
-- (app bank khong hien ma GD -> reference_no thuong NULL)
CREATE UNIQUE INDEX IF NOT EXISTS bank_statements_dedupe_idx
  ON brain.bank_statements (
    account_no, txn_date, amount, direction,
    COALESCE(reference_no,''), COALESCE(balance_after, -1)
  );

CREATE INDEX IF NOT EXISTS bank_statements_recon_idx
  ON brain.bank_statements (txn_date DESC, txn_kind, status);

COMMENT ON COLUMN brain.bank_statements.account_no IS
  '9969975935 = TK chinh (khach CK ve). 1014095502 = TK nguon vi dien tu/the tin dung/GPay.';
COMMENT ON COLUMN brain.bank_statements.txn_kind IS
  'Nguoi phan loai luc duyet, khong suy tu account_no duoc (chi phi tra lan lon ca 2 TK). nap_nguon = tien chua roi khoi he thong, chi that nam o tang vi (public.expenses).';
COMMENT ON COLUMN brain.bank_statements.wallet IS
  'Bat buoc khi txn_kind = nap_nguon: zalopay | momo | shopeepay | gpay | the_tin_dung';
COMMENT ON COLUMN brain.bank_statements.balance_after IS
  'So du sau GD, doc tu app bank. Vua la checksum phat hien thieu dong, vua phan biet 2 GD trung so tien trong ngay.';
