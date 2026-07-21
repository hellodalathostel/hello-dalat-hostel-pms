-- Ghi chú cảnh báo: monthly_revenue KHÔNG phải dead code, đang dùng thật bởi
-- useRevenue.ts (dashboard doanh thu theo tháng/phòng/nguồn, có confirmed/projected).
-- Audit 2026-06-26 đề xuất sai khi gợi ý đổi sang finance_monthly_revenue —
-- 2 view có schema và mục đích khác nhau hoàn toàn (xem brain.knowledge
-- key=audit_2026-06-26_remaining_backlog, item #1, đã correct lại).
-- finance_monthly_revenue dùng cho tax/finance reconciliation theo group,
-- chỉ tính booking đã checked-out — KHÔNG thay thế được monthly_revenue.
COMMENT ON VIEW public.monthly_revenue IS
  'ACTIVE — dùng bởi useRevenue.ts (frontend revenue dashboard theo tháng/room_id/source, gồm cả projected revenue từ booking chưa checkout). KHÔNG xóa, KHÔNG thay bằng finance_monthly_revenue (mục đích khác: finance/tax theo group, chỉ checked-out).';