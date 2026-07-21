-- So ngan hang khai moi tu 21/07/2026. Khong truy nguoc qua khu.
-- Khac so quy tien mat: khong can chot ca, vi balance_after tu sao ke la checksum lien tuc.

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  account_no        text PRIMARY KEY,
  bank              text NOT NULL,
  ten_hien_thi      text NOT NULL,
  mo_ta             text,
  opening_balance   numeric NOT NULL,
  opening_at        timestamptz NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bank_accounts IS
  'Tai khoan ngan hang cua hostel + moc khai so. Moi TK co moc rieng (opening_at khac nhau).';
COMMENT ON COLUMN public.bank_accounts.opening_at IS
  'Thoi diem khai so = thoi diem GD cuoi cung doc duoc tu app. GD tu sau moc nay moi vao so chinh thuc.';

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.bank_accounts TO anon, authenticated;
GRANT ALL    ON public.bank_accounts TO service_role;

DROP POLICY IF EXISTS bank_accounts_select ON public.bank_accounts;
CREATE POLICY bank_accounts_select ON public.bank_accounts
  FOR SELECT TO authenticated USING (true);

-- Danh dau 14 dong da nhap la lich su tham chieu, khong thuoc so chinh thuc
ALTER TABLE brain.bank_statements
  ADD COLUMN IF NOT EXISTS is_opening_history boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN brain.bank_statements.is_opening_history IS
  'true = du lieu truoc moc khai so, giu de tham chieu/giai thich so du dau ky, loai khoi so chinh thuc.';

INSERT INTO public.bank_accounts
  (account_no, bank, ten_hien_thi, mo_ta, opening_balance, opening_at)
VALUES
  ('9969975935','VCB','TK chinh',
   'Khach chuyen khoan ve, chi phi hostel. Moc: GD cuoi 21/07 13:57:42.',
   7117268, '2026-07-21 13:57:42+07'),
  ('1014095502','VCB','TK nguon vi/the',
   'Nguon vi dien tu, the tin dung, GPay. Nhan tien the mPOS qua ba. Moc: GD cuoi doc duoc 21/07 09:35:53.',
   7468199, '2026-07-21 09:35:53+07')
ON CONFLICT (account_no) DO UPDATE
  SET opening_balance = EXCLUDED.opening_balance,
      opening_at      = EXCLUDED.opening_at,
      mo_ta           = EXCLUDED.mo_ta,
      updated_at      = now();
