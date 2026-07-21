-- Thêm cột booking_note vào view room_calendar để hiển thị ghi chú booking trên Calendar,
-- thay thế/bổ sung cho customer_phone (theo yêu cầu Hiếu 2026-07-01).
-- Cột mới bắt buộc thêm ở CUỐI danh sách SELECT để CREATE OR REPLACE VIEW không lỗi.

CREATE OR REPLACE VIEW public.room_calendar AS
 SELECT b.room_id,
    r.name AS room_name,
    b.check_in,
    b.check_out,
    b.nights,
    b.status::text AS booking_status,
    'booking'::text AS entry_type,
    b.guest_name,
    g.customer_phone,
    g.source::text AS source,
    g.paid,
    g.net_revenue,
    b.price_per_night,
    b.room_subtotal,
    b.grand_total,
    b.tax_amount,
    g.id AS group_id,
    b.id AS booking_id,
    NULL::uuid AS block_id,
    b.note AS booking_note
   FROM bookings b
     JOIN rooms r ON r.id = b.room_id
     JOIN groups g ON g.id = b.group_id
  WHERE b.is_deleted = false AND b.status <> 'cancelled'::booking_status
UNION ALL
 SELECT rb.room_id,
    r.name AS room_name,
    rb.start_date AS check_in,
    rb.end_date AS check_out,
    rb.end_date - rb.start_date AS nights,
    'blocked'::text AS booking_status,
    'block'::text AS entry_type,
    rb.note AS guest_name,
    NULL::text AS customer_phone,
    NULL::text AS source,
    0 AS paid,
    0 AS net_revenue,
    0 AS price_per_night,
    0 AS room_subtotal,
    0 AS grand_total,
    0 AS tax_amount,
    NULL::uuid AS group_id,
    NULL::uuid AS booking_id,
    rb.id AS block_id,
    NULL::text AS booking_note
   FROM room_blocks rb
     JOIN rooms r ON r.id = rb.room_id
UNION ALL
 SELECT ocf.room_id,
    r.name AS room_name,
    ocf.check_in,
    ocf.check_out,
    ocf.check_out - ocf.check_in AS nights,
    'blocked'::text AS booking_status,
    'ota_block'::text AS entry_type,
    ocf.summary AS guest_name,
    NULL::text AS customer_phone,
    ocf.ota_source AS source,
    0 AS paid,
    0 AS net_revenue,
    0 AS price_per_night,
    0 AS room_subtotal,
    0 AS grand_total,
    0 AS tax_amount,
    NULL::uuid AS group_id,
    NULL::uuid AS booking_id,
    ocf.id AS block_id,
    NULL::text AS booking_note
   FROM ota_calendar_feed ocf
     JOIN rooms r ON r.id = ocf.room_id
  WHERE ocf.linked_group_id IS NULL AND ocf.is_cancelled = false AND ocf.check_out >= CURRENT_DATE AND NOT (EXISTS ( SELECT 1
           FROM bookings b
          WHERE b.room_id = ocf.room_id AND b.is_deleted = false AND b.status <> 'cancelled'::booking_status AND b.check_in < ocf.check_out AND b.check_out > ocf.check_in))
  ORDER BY 3, 1;