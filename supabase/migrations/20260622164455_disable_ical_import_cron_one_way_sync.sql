
-- Chuyển iCal sync về 1 chiều duy nhất: PMS → Booking.com (qua ical-feed, Booking.com tự poll)
-- Bỏ chiều OTA → PMS (ical-import) vì gây nguy cơ vòng lặp/conflict dữ liệu, không cần thiết
-- khi PMS đã là source of truth và export ra ngoài qua ical-feed.

select cron.unschedule(21);
