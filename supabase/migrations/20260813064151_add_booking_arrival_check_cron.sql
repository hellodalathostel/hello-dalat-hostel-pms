-- !! BẢN ĐÃ CHE SECRET — CHỈ ĐỂ LƯU LỊCH SỬ, KHÔNG ĐƯỢC REPLAY !!
-- Bản gốc trên remote chứa credential viết thẳng. Xem báo cáo PR #15.
-- Muốn dựng lại cron job: dùng Vault / secret, không viết thẳng khoá.

SELECT cron.schedule(
  'booking-arrival-check-daily',
  '30 0 * * *',
  $$
  select net.http_post(
    url := 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/booking-arrival-check',
    headers := '{"x-cron-key": "<REDACTED_SECRET>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
