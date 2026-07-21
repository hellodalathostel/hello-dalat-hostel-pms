-- Thêm cron job tự động gọi ical-import mỗi sáng 6:00 ICT (23:00 UTC hôm trước)
-- Dùng CRON_SECRET (giống pattern jobid=12 daily-revenue-summary)

SELECT cron.schedule(
  'ical-import-daily',
  '0 23 * * *',
  $$
  select net.http_post(
    url := 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/ical-import',
    headers := '{"Authorization": "Bearer 141c7f7b522b6a107304b144dbce8b7e8ab6e4303a4482c907bff603f5fefd10", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);