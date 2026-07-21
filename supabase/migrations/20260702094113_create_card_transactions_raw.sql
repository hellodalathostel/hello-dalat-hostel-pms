
CREATE TABLE brain.card_transactions_raw (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bank TEXT NOT NULL,                    -- vietcombank | mb | tpbank
  card_last4 TEXT,                       -- 4 số cuối thẻ nếu parse được
  txn_datetime TIMESTAMPTZ,              -- thời gian giao dịch (theo email)
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'VND',
  merchant_raw TEXT,                     -- text merchant gốc từ email
  category TEXT,                        -- coin_master | grab | shopee | other | uncategorized
  email_message_id TEXT,                 -- Gmail message ID để tra cứu / tránh re-insert cùng email
  email_subject TEXT,
  raw_snippet TEXT,                      -- toàn bộ snippet gốc để rà soát sau
  is_reviewed BOOLEAN DEFAULT false,      -- Hiếu đã rà soát trùng/phân loại lại chưa
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tránh insert lại đúng 1 email (Apps Script có thể chạy lại do lỗi mạng)
CREATE UNIQUE INDEX idx_card_txn_email_unique ON brain.card_transactions_raw(email_message_id);

CREATE INDEX idx_card_txn_datetime ON brain.card_transactions_raw(txn_datetime);
CREATE INDEX idx_card_txn_category ON brain.card_transactions_raw(category);

ALTER TABLE brain.card_transactions_raw ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON brain.card_transactions_raw TO service_role;

CREATE POLICY "service_role_all" ON brain.card_transactions_raw
  FOR ALL TO service_role USING (true) WITH CHECK (true);
