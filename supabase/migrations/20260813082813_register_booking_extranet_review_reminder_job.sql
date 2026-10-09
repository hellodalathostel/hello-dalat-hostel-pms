
INSERT INTO automation.job_registry (job_name, description, expected_interval, grace_period, severity, heartbeat_enabled, cron_job_name)
VALUES (
  'booking-extranet-review-reminder',
  'Nhac hang thang doi chieu toan bo booking Booking.com active/tuong lai voi Extranet (khong tu dong sua, chi nhac + xuat danh sach)',
  '31 days',
  '2 days',
  'Binh Thuong',
  false,
  'booking-extranet-review-reminder-monthly'
);
