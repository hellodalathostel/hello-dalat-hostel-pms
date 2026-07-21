-- Thêm cột content để lưu nội dung đầy đủ của artifact dài (prompt, SQL, template...)
ALTER TABLE brain.artifacts ADD COLUMN content text;

-- Bật RLS theo rule 30/5 (enforce toàn bộ từ 30/10)
ALTER TABLE brain.artifacts ENABLE ROW LEVEL SECURITY;

-- GRANT: chỉ service_role full access (bảng nội bộ, không phải bảng client app)
GRANT SELECT, INSERT, UPDATE, DELETE ON brain.artifacts TO service_role;

-- Policy: service_role full access
CREATE POLICY "service_role_full_access" ON brain.artifacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
