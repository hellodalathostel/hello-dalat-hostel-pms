-- !! BẢN ĐÃ CHE SECRET — CHỈ ĐỂ LƯU LỊCH SỬ, KHÔNG ĐƯỢC REPLAY !!
-- Bản gốc trên remote chứa credential viết thẳng. Xem báo cáo PR #15.
-- Muốn dựng lại cron job: dùng Vault / secret, không viết thẳng khoá.

-- Ngay 1 hang thang, 08:00 ICT = 01:00 UTC
SELECT cron.schedule(
  'booking-extranet-review-reminder-monthly',
  '0 1 1 * *',
  $$
  select net.http_post(
    url := 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/booking-extranet-review-reminder',
    headers := '{"x-cron-key": "<REDACTED_SECRET>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
