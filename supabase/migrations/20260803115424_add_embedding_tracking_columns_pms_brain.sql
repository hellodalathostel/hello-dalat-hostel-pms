-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 03/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================
-- Giai đoạn 1 mục 2: thêm cột track embedding version/staleness + validity window
-- Áp dụng cho brain.knowledge và brain.decisions (2 bảng có embedding trên PMS Brain)

ALTER TABLE brain.knowledge ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE brain.knowledge ADD COLUMN IF NOT EXISTS content_hash text;
-- knowledge đã có valid_from/valid_to sẵn (dùng cho supersession theo key), không thêm lại

ALTER TABLE brain.decisions ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE brain.decisions ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE brain.decisions ADD COLUMN IF NOT EXISTS valid_from date DEFAULT CURRENT_DATE;
ALTER TABLE brain.decisions ADD COLUMN IF NOT EXISTS valid_to date;

-- decisions không có updated_at sẵn — thêm để biết nội dung đổi khi nào (cần cho staleness check)
ALTER TABLE brain.decisions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN brain.knowledge.embedding_model IS 'Tên+version model đã dùng để tạo embedding hiện tại (vd voyage-4-lite). NULL = chưa từng embed hoặc embed trước khi có cột này.';
COMMENT ON COLUMN brain.knowledge.content_hash IS 'md5(category || key || value) tại thời điểm embed gần nhất — dùng để phát hiện content đổi mà chưa re-embed.';
COMMENT ON COLUMN brain.decisions.embedding_model IS 'Tên+version model đã dùng để tạo embedding hiện tại (vd voyage-4-lite). NULL = chưa từng embed hoặc embed trước khi có cột này.';
COMMENT ON COLUMN brain.decisions.content_hash IS 'md5(topic || context || chosen_option || rationale) tại thời điểm embed gần nhất — dùng để phát hiện content đổi mà chưa re-embed.';
COMMENT ON COLUMN brain.decisions.valid_from IS 'Ngày decision này có hiệu lực (bi-temporal supersession pattern).';
COMMENT ON COLUMN brain.decisions.valid_to IS 'Ngày decision này bị thay thế/hết hiệu lực. NULL = vẫn còn hiệu lực.';