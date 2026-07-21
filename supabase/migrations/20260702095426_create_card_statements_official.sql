
CREATE TABLE brain.card_statements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bank TEXT NOT NULL,                    -- vietcombank | mb | tpbank | vib
  card_last4 TEXT,
  txn_date DATE NOT NULL,
  txn_datetime TIMESTAMPTZ,              -- nếu statement có giờ, else null
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'VND',
  merchant TEXT,                         -- tên merchant theo statement (thường sạch hơn email)
  category TEXT,                         -- coin_master | grab | shopee | other | uncategorized
  statement_period TEXT,                 -- '2026-06' - kỳ sao kê nguồn
  reference_no TEXT,                     -- mã tham chiếu/giao dịch của ngân hàng nếu có, dùng chống trùng
  source_file TEXT,                      -- tên file CSV gốc đã import, để truy vết
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chống import lại cùng 1 giao dịch nếu vô tình chạy import file 2 lần
CREATE UNIQUE INDEX idx_card_stmt_dedupe ON brain.card_statements(bank, txn_date, amount, COALESCE(reference_no, ''));

CREATE INDEX idx_card_stmt_period ON brain.card_statements(statement_period);
CREATE INDEX idx_card_stmt_category ON brain.card_statements(category);

ALTER TABLE brain.card_statements ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON brain.card_statements TO service_role;

CREATE POLICY "service_role_all" ON brain.card_statements
  FOR ALL TO service_role USING (true) WITH CHECK (true);
