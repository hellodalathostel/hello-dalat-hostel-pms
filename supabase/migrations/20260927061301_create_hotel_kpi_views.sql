-- Migration: create_hotel_kpi_views
-- Occupancy / ADR / RevPAR views for dashboard & reports.
--
-- Both views are built on public.daily_revenue (1 row = 1 room-night sold,
-- cancelled + soft-deleted bookings already excluded) so a booking spanning
-- two months is split correctly across months. monthly_revenue is NOT used
-- because it attributes all nights of a booking to its check-in month.
--
-- security_invoker = true: without it a view runs with the owner's
-- privileges and bypasses RLS on bookings/groups/rooms.
--
-- total_rooms = rooms currently active (history uses today's count).

-- ============================================================
-- 1. daily_hotel_kpi — per stay date (zero-sale days included)
-- ============================================================
CREATE OR REPLACE VIEW public.daily_hotel_kpi
WITH (security_invoker = true) AS
WITH active_rooms AS (
  SELECT count(*)::numeric AS total_rooms
  FROM public.rooms
  WHERE is_active
),
daily_agg AS (
  SELECT
    stay_date,
    count(*)::numeric                AS rooms_sold,
    sum(room_gross_revenue)::numeric AS room_gross_revenue,
    sum(room_net_revenue)::numeric   AS room_net_revenue,
    sum(service_revenue)::numeric    AS service_revenue
  FROM public.daily_revenue
  GROUP BY stay_date
),
calendar AS (
  SELECT gs::date AS stay_date
  FROM (SELECT min(stay_date) AS d0, max(stay_date) AS d1 FROM daily_agg) b
  CROSS JOIN LATERAL generate_series(b.d0, b.d1, interval '1 day') gs
)
SELECT
  c.stay_date,
  ar.total_rooms,
  COALESCE(d.rooms_sold, 0)         AS rooms_sold,
  COALESCE(d.room_gross_revenue, 0) AS room_gross_revenue,
  COALESCE(d.room_net_revenue, 0)   AS room_net_revenue,
  COALESCE(d.service_revenue, 0)    AS service_revenue,
  round(COALESCE(d.rooms_sold, 0) / NULLIF(ar.total_rooms, 0) * 100, 1) AS occupancy_rate_pct,
  CASE WHEN COALESCE(d.rooms_sold, 0) > 0
    THEN round(d.room_gross_revenue / d.rooms_sold)
    ELSE 0
  END AS adr,
  round(COALESCE(d.room_gross_revenue, 0) / NULLIF(ar.total_rooms, 0)) AS revpar
FROM calendar c
CROSS JOIN active_rooms ar
LEFT JOIN daily_agg d ON d.stay_date = c.stay_date
ORDER BY c.stay_date DESC;

-- ============================================================
-- 2. monthly_hotel_kpi — per calendar month of stay date
-- ============================================================
CREATE OR REPLACE VIEW public.monthly_hotel_kpi
WITH (security_invoker = true) AS
WITH active_rooms AS (
  SELECT count(*)::numeric AS total_rooms
  FROM public.rooms
  WHERE is_active
),
monthly_agg AS (
  SELECT
    date_trunc('month', stay_date)::date AS month,
    count(DISTINCT booking_id)::numeric  AS booking_count,
    count(*)::numeric                    AS rooms_sold,
    sum(room_gross_revenue)::numeric     AS gross_room_revenue,
    sum(room_net_revenue)::numeric       AS net_revenue,
    sum(service_revenue)::numeric        AS service_revenue,
    sum(tax_amount)::numeric             AS total_tax
  FROM public.daily_revenue
  GROUP BY 1
),
with_capacity AS (
  SELECT
    m.*,
    ar.total_rooms,
    ar.total_rooms
      * extract(day FROM (m.month + interval '1 month' - interval '1 day'))::numeric
      AS available_room_nights
  FROM monthly_agg m
  CROSS JOIN active_rooms ar
)
SELECT
  month,
  total_rooms,
  available_room_nights,
  rooms_sold AS room_nights_sold,
  booking_count,
  gross_room_revenue,
  net_revenue,
  service_revenue,
  total_tax,
  round(rooms_sold / NULLIF(available_room_nights, 0) * 100, 1) AS occupancy_rate_pct,
  CASE WHEN rooms_sold > 0
    THEN round(gross_room_revenue / rooms_sold)
    ELSE 0
  END AS adr,
  round(gross_room_revenue / NULLIF(available_room_nights, 0)) AS revpar
FROM with_capacity
ORDER BY month DESC;

-- ============================================================
-- Grants — same convention as daily_revenue (finance data, no anon)
-- ============================================================
GRANT SELECT ON public.daily_hotel_kpi TO authenticated;
GRANT SELECT ON public.monthly_hotel_kpi TO authenticated;
REVOKE ALL ON public.daily_hotel_kpi FROM anon, PUBLIC;
REVOKE ALL ON public.monthly_hotel_kpi FROM anon, PUBLIC;
