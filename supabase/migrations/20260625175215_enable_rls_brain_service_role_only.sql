-- Brain schema chỉ truy cập qua Claude (service_role, bypass RLS).
-- Enable RLS không kèm policy cho anon/authenticated = chặn hoàn toàn 2 role đó,
-- service_role vẫn full access vì service_role luôn bypass RLS ở Postgres/Supabase.

ALTER TABLE brain.knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.daily_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.personal_finances ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.financial_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain.revenue_manual_log ENABLE ROW LEVEL SECURITY;

-- Revoke mọi quyền trực tiếp từ anon/authenticated trên 7 bảng này (defense in depth,
-- phòng trường hợp có GRANT cũ từ trước còn sót lại)
REVOKE ALL ON brain.knowledge FROM anon, authenticated;
REVOKE ALL ON brain.decisions FROM anon, authenticated;
REVOKE ALL ON brain.daily_log FROM anon, authenticated;
REVOKE ALL ON brain.conversations FROM anon, authenticated;
REVOKE ALL ON brain.personal_finances FROM anon, authenticated;
REVOKE ALL ON brain.financial_summary FROM anon, authenticated;
REVOKE ALL ON brain.revenue_manual_log FROM anon, authenticated;
