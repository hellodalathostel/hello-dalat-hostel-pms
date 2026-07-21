-- 02b: Sua v_s1a_hkd de dung actual_check_out (thay check_out ke hoach) va
-- chi tinh booking status='checked-out' (thay '<> cancelled') cho ngay/thang/nam ghi so.
-- Quyet dinh brain.decisions 2026-07-15 "S1a-HKD: chuyen sang actual_check_out, chi tinh checked-out".
-- Tien de: data-fix 254/259 booking backlog Jan-May 2026 da chay xong cung ngay (payment + checked-out).
CREATE OR REPLACE VIEW v_s1a_hkd
WITH (security_invoker = true) AS
WITH own_services AS (
  SELECT bs.booking_id,
    COALESCE(sum(bs.price::numeric * bs.qty), 0::numeric)::integer AS own_svc_total
  FROM booking_services bs
  JOIN services s ON s.id = bs.service_id
  WHERE s.service_type = 'own'::service_type
  GROUP BY bs.booking_id
), discounts AS (
  SELECT booking_discounts.booking_id,
    COALESCE(sum(booking_discounts.amount), 0::bigint)::integer AS discount_total
  FROM booking_discounts
  GROUP BY booking_discounts.booking_id
)
SELECT
  COALESCE(b.actual_check_out::date, b.check_out) AS ngay_ghi_so,
  ((r.name || ' — '::text) || COALESCE(g.customer_name, b.guest_name, 'Khách lẻ'::text)) ||
    CASE WHEN g.source IS NOT NULL THEN (' ('::text || g.source::text) || ')'::text ELSE ''::text END AS dien_giai,
  b.room_subtotal + b.surcharge + b.tax_amount + COALESCE(os.own_svc_total, 0) - COALESCE(d.discount_total, 0) AS so_tien,
  b.id AS booking_id,
  b.room_id,
  b.check_in,
  g.source,
  date_part('year'::text, COALESCE(b.actual_check_out::date, b.check_out))::integer AS nam,
  date_part('month'::text, COALESCE(b.actual_check_out::date, b.check_out))::integer AS thang
FROM bookings b
JOIN rooms r ON r.id = b.room_id
LEFT JOIN groups g ON g.id = b.group_id
LEFT JOIN own_services os ON os.booking_id = b.id
LEFT JOIN discounts d ON d.booking_id = b.id
WHERE b.is_deleted = false AND b.status = 'checked-out'::booking_status
ORDER BY COALESCE(b.actual_check_out::date, b.check_out), b.room_id;
