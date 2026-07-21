-- Them TK MB Bank 639679639679. Mo rong 2 constraint dang hardcode danh sach TK.
ALTER TABLE brain.bank_statements
  DROP CONSTRAINT IF EXISTS bank_statements_account_check,
  ADD  CONSTRAINT bank_statements_account_check
    CHECK (account_no IN ('9969975935','1014095502','639679639679'));

-- noi_bo phai cho phep chuyen giua MB va ca 2 TK VCB
ALTER TABLE brain.bank_statements
  DROP CONSTRAINT IF EXISTS bank_statements_kind_detail_check,
  ADD  CONSTRAINT bank_statements_kind_detail_check CHECK (
    CASE txn_kind
      WHEN 'noi_bo' THEN
        counterpart_account IS NOT NULL
        AND counterpart_account <> account_no
        AND counterpart_account IN ('9969975935','1014095502','639679639679')
        AND wallet IS NULL
      WHEN 'nap_nguon' THEN
        wallet IS NOT NULL AND counterpart_account IS NULL
      ELSE
        counterpart_account IS NULL AND wallet IS NULL
    END
  );

INSERT INTO public.bank_accounts
  (account_no, bank, ten_hien_thi, mo_ta, opening_balance, opening_at)
VALUES
  ('639679639679','MB','TK MB Bank',
   'Khai so 21/07/2026. Chua co lich su GD nhap - moi GD tu moc nay tro di vao so.',
   355739, '2026-07-21 17:30:00+07')
ON CONFLICT (account_no) DO UPDATE
  SET opening_balance = EXCLUDED.opening_balance,
      opening_at      = EXCLUDED.opening_at,
      bank            = EXCLUDED.bank,
      ten_hien_thi    = EXCLUDED.ten_hien_thi,
      mo_ta           = EXCLUDED.mo_ta,
      updated_at      = now();
