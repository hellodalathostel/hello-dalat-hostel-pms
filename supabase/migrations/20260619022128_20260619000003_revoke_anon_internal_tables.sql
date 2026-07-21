-- M6: REVOKE anon privileges từ bảng nội bộ
-- RLS đã chặn anon (không có policy nào cho anon), nhưng REVOKE tầng GRANT
-- để defense-in-depth — tránh trường hợp policy mới vô tình mở quyền cho anon.
-- Ngày: 2026-06-19

REVOKE ALL ON public.bookings FROM anon;
REVOKE ALL ON public.groups FROM anon;
REVOKE ALL ON public.payment_history FROM anon;
REVOKE ALL ON public.booking_guests FROM anon;
REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.booking_services FROM anon;
REVOKE ALL ON public.booking_discounts FROM anon;
REVOKE ALL ON public.room_issues FROM anon;
REVOKE ALL ON public.ota_calendar_feed FROM anon;

-- rooms: chỉ giữ SELECT (public booking form cần đọc danh sách phòng)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.rooms FROM anon;

-- booking_requests: chỉ giữ INSERT (public /book form)
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.booking_requests FROM anon;