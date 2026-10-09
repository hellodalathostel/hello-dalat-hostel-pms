-- Gỡ GRANT cấp bảng của anon trên bảng/view nội bộ (RLS vẫn giữ nguyên, đây là lớp phòng thủ thứ hai).
-- Không đụng: booking_requests (anon chỉ INSERT), rooms (grant cấp cột).
REVOKE ALL ON TABLE
  public.app_users, public.bank_accounts, public.bot_leads, public.cash_transactions,
  public.document_logs, public.expense_line_items, public.expenses, public.holidays,
  public.hotel_kpi_snapshots, public.ops_tasks, public.pass_through_transactions,
  public.pricing_rules, public.revenue_manual_log, public.services, public.tours
FROM anon;

REVOKE ALL ON TABLE
  public.bank_book_daily, public.bank_book_detail,
  public.bank_mpos_reconciliation, public.bank_reconciliation
FROM anon;

-- 2 bảng breakfast: anon chỉ cần SELECT (policy hiện có), bỏ TRUNCATE/REFERENCES/TRIGGER.
REVOKE ALL ON TABLE public.breakfast_daily_snapshot, public.breakfast_price_history FROM anon;
GRANT SELECT ON TABLE public.breakfast_daily_snapshot, public.breakfast_price_history TO anon;
