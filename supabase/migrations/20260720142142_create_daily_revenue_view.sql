-- View daily_revenue: phan bo doanh thu xuong tung dem (accrual theo dem)
-- Tang 1: Hamilton phan bo net_revenue cap group -> tung booking (giong monthly_revenue)
-- Tang 2: Hamilton phan bo allocated_net_revenue cua booking -> tung dem
-- Services tach rieng, gan vao dem cuoi (check_out - 1)

CREATE OR REPLACE VIEW public.daily_revenue
WITH (security_invoker = true)
AS
WITH group_totals AS (
  SELECT
    b.group_id,
    SUM(b.room_subtotal) AS group_room_subtotal_sum,
    COUNT(*)             AS booking_count_in_group
  FROM bookings b
  WHERE b.is_deleted = false
    AND b.status <> 'cancelled'::booking_status
  GROUP BY b.group_id
),
raw_share AS (
  SELECT
    b.id AS booking_id,
    b.group_id,
    b.room_id,
    b.check_in,
    b.check_out,
    b.nights,
    b.room_subtotal,
    b.tax_amount,
    b.status,
    g.source,
    g.channel_fee_rate,
    g.net_revenue AS group_net_revenue,
    CASE
      WHEN gt.group_room_subtotal_sum > 0
        THEN (g.net_revenue::numeric * b.room_subtotal::numeric) / gt.group_room_subtotal_sum::numeric
      ELSE g.net_revenue::numeric / gt.booking_count_in_group::numeric
    END AS exact_share
  FROM bookings b
  JOIN groups g        ON g.id = b.group_id
  JOIN group_totals gt ON gt.group_id = b.group_id
  WHERE b.is_deleted = false
    AND b.status <> 'cancelled'::booking_status
),
floored AS (
  SELECT
    rs.*,
    FLOOR(rs.exact_share)::bigint          AS floor_share,
    rs.exact_share - FLOOR(rs.exact_share) AS fractional_remainder
  FROM raw_share rs
),
group_remainder AS (
  SELECT
    f.group_id,
    (f.group_net_revenue::bigint::numeric - SUM(f.floor_share))::bigint AS remainder_units
  FROM floored f
  GROUP BY f.group_id, f.group_net_revenue
),
ranked_booking AS (
  SELECT
    f.*,
    ROW_NUMBER() OVER (
      PARTITION BY f.group_id
      ORDER BY f.fractional_remainder DESC, f.booking_id
    ) AS remainder_rank
  FROM floored f
),
booking_allocation AS (
  SELECT
    r.booking_id,
    r.group_id,
    r.room_id,
    r.check_in,
    r.check_out,
    r.nights,
    r.room_subtotal,
    r.tax_amount,
    r.status,
    r.source,
    r.channel_fee_rate,
    (
      r.floor_share
      + CASE
          WHEN r.remainder_rank <= (
            SELECT gr.remainder_units FROM group_remainder gr WHERE gr.group_id = r.group_id
          ) THEN 1
          ELSE 0
        END
    ) AS allocated_net_revenue
  FROM ranked_booking r
),
nights_expanded AS (
  SELECT
    ba.*,
    gs.stay_date::date AS stay_date,
    ROW_NUMBER() OVER (
      PARTITION BY ba.booking_id ORDER BY gs.stay_date
    ) AS night_index
  FROM booking_allocation ba
  CROSS JOIN LATERAL generate_series(
    ba.check_in::timestamp,
    (ba.check_out - 1)::timestamp,
    INTERVAL '1 day'
  ) AS gs(stay_date)
  WHERE ba.nights > 0
),
night_floored AS (
  SELECT
    ne.*,
    FLOOR(ne.allocated_net_revenue::numeric / ne.nights::numeric)::bigint AS night_floor_share,
    (ne.allocated_net_revenue
      - FLOOR(ne.allocated_net_revenue::numeric / ne.nights::numeric)::bigint * ne.nights
    ) AS night_remainder_units
  FROM nights_expanded ne
),
booking_services_total AS (
  SELECT
    bs.booking_id,
    COALESCE(SUM(bs.price::numeric * bs.qty), 0)::integer AS service_revenue
  FROM booking_services bs
  GROUP BY bs.booking_id
)
SELECT
  nf.stay_date,
  nf.booking_id,
  nf.group_id,
  nf.room_id,
  nf.status,
  nf.source::text        AS source,
  nf.channel_fee_rate,
  nf.night_index,
  nf.nights,
  nf.check_in,
  nf.check_out,
  (nf.night_floor_share
    + CASE WHEN nf.night_index <= nf.night_remainder_units THEN 1 ELSE 0 END
  )::integer             AS room_net_revenue,
  ROUND(nf.room_subtotal::numeric / nf.nights::numeric)::integer AS room_gross_revenue,
  CASE
    WHEN nf.night_index = nf.nights THEN COALESCE(bst.service_revenue, 0)
    ELSE 0
  END::integer           AS service_revenue,
  CASE WHEN nf.night_index = nf.nights THEN nf.tax_amount ELSE 0 END::integer AS tax_amount
FROM night_floored nf
LEFT JOIN booking_services_total bst ON bst.booking_id = nf.booking_id;

GRANT SELECT ON public.daily_revenue TO authenticated;
REVOKE ALL ON public.daily_revenue FROM anon;
REVOKE ALL ON public.daily_revenue FROM PUBLIC;