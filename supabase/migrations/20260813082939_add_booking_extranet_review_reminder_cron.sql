-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 13/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================

-- Ngay 1 hang thang, 08:00 ICT = 01:00 UTC
SELECT cron.schedule(
  'booking-extranet-review-reminder-monthly',
  '0 1 1 * *',
  $$
  select net.http_post(
    url := 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/booking-extranet-review-reminder',
    headers := '{"x-cron-key": "b3e5b039535000f0f74e984c465d83e98e89c88fb1e0077d5d5f8d46d7954799", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
