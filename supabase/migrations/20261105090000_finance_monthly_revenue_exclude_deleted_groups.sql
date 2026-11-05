-- Loại group đã soft-delete khỏi view doanh thu tháng.
CREATE OR REPLACE VIEW public.finance_monthly_revenue
WITH (security_invoker = true) AS
SELECT g.id AS group_id,
    g.customer_name,
    g.source,
    g.net_revenue,
    g.paid,
    g.channel_fee_rate,
    min(b.check_in) AS check_in,
    max(b.check_out) AS check_out,
    COALESCE(sum(bs.price::numeric * bs.qty), 0::numeric)::integer AS service_revenue,
    count(DISTINCT b.id) AS booking_count
FROM groups g
  JOIN bookings b ON b.group_id = g.id
                 AND b.is_deleted = false
                 AND b.status = 'checked-out'::booking_status
  LEFT JOIN booking_services bs ON bs.booking_id = b.id
WHERE g.is_deleted = false
GROUP BY g.id, g.customer_name, g.source, g.net_revenue, g.paid, g.channel_fee_rate;
