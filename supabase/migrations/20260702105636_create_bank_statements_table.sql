
CREATE TABLE brain.bank_statements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bank TEXT NOT NULL,                     -- vietcombank | mb | tpbank | vib
  card_last4 TEXT,
  txn_date DATE NOT NULL,
  txn_datetime TIMESTAMPTZ,                -- nếu statement có giờ chi tiết
  amount NUMERIC NOT NULL,                 -- dương = chi, âm = hoàn tiền/refund (theo dấu trong statement)
  currency TEXT DEFAULT 'VND',
  merchant TEXT,                           -- tên merchant đã chuẩn hoá từ statement (thường sạch hơn email)
  category TEXT,                           -- coin_master | grab | shopee | other | uncategorized
  statement_period TEXT,                   -- ví dụ '2026-06' — kỳ sao kê nguồn
  reference_no TEXT,                       -- mã tham chiếu/giao dịch nếu statement có
  raw_row JSONB,                           -- toàn bộ dòng CSV gốc, để truy xuất khi cần
  imported_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chống import lại trùng dòng: mỗi ngân hàng + ngày + số tiền + mã tham chiếu (nếu có) là duy nhất
CREATE UNIQUE INDEX idx_bank_stmt_unique ON brain.bank_statements(bank, txn_date, amount, COALESCE(reference_no, ''));

CREATE INDEX idx_bank_stmt_period ON brain.bank_statements(statement_period);
CREATE INDEX idx_bank_stmt_category ON brain.bank_statements(category);

ALTER TABLE brain.bank_statements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON brain.bank_statements TO service_role;
CREATE POLICY "service_role_all" ON brain.bank_statements
  FOR ALL TO service_role USING (true) WITH CHECK (true);
