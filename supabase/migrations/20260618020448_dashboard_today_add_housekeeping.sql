-- Thêm housekeeping_status/housekeeping_note vào CUỐI view dashboard_today.
-- CREATE OR REPLACE VIEW chỉ cho phép APPEND cột mới ở cuối, không chèn giữa.
CREATE OR REPLACE VIEW public.dashboard_today AS
 SELECT r.id AS room_id,
    r.name AS room_name,
    r.type AS room_type,
    r.capacity,
    b.id AS booking_id,
    b.check_in,
    b.check_out,
    b.status::text AS status,
    b.guest_name,
    b.guests_count,
    g.id AS group_id,
    g.customer_phone,
    g.source::text AS source,
    g.paid,
    g.net_revenue,
    b.price_per_night,
    b.nights,
    b.room_subtotal,
    b.grand_total,
    COALESCE(b.grand_total, b.room_subtotal, 0) - COALESCE(g.paid, 0) AS balance_due,
        CASE
            WHEN rb.id IS NOT NULL THEN true
            WHEN b.id IS NULL AND ocf.id IS NOT NULL THEN true
            ELSE false
        END AS is_blocked,
    COALESCE(rb.reason::text, ocf.ota_source) AS block_reason,
    ocf.id AS ota_block_id,
    r.housekeeping_status,
    r.housekeeping_note
   FROM rooms r
     LEFT JOIN bookings b ON b.room_id = r.id AND b.is_deleted = false AND (b.status = ANY (ARRAY['booked'::booking_status, 'checked-in'::booking_status])) AND b.check_in <= CURRENT_DATE AND b.check_out >= CURRENT_DATE
     LEFT JOIN groups g ON g.id = b.group_id
     LEFT JOIN room_blocks rb ON rb.room_id = r.id AND rb.start_date <= CURRENT_DATE AND rb.end_date > CURRENT_DATE
     LEFT JOIN ota_calendar_feed ocf ON ocf.room_id = r.id AND ocf.check_in <= CURRENT_DATE AND ocf.check_out > CURRENT_DATE AND ocf.linked_group_id IS NULL AND ocf.is_cancelled = false AND b.id IS NULL
  WHERE r.is_active = true
  ORDER BY r.id;
