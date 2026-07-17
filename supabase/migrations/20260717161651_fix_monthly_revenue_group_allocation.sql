-- Migration 03: sua double-counting net_revenue trong monthly_revenue
--
-- BUG: view goc GROUP BY (month, source, room_id) va SUM(g.net_revenue) -
-- neu 1 group co N booking/phong trong cung thang, net_revenue cua group
-- (von la 1 con so duy nhat cho ca group) bi cong lap N lan.
--
-- FIX: phan bo net_revenue cua group cho tung booking theo ty trong
-- room_subtotal, dung TRUE LARGEST-REMAINDER method (Hamilton/Largest
-- Remainder apportionment) de tong SUM(net_revenue) sau phan bo khop
-- tuyet doi voi net_revenue goc cua group:
--   1. Tinh phan nguyen floor() cho tung booking trong group (exact_share).
--   2. Tinh phan du con lai cua group = net_revenue - SUM(floor_share).
--   3. Sap xep cac booking trong group theo PHAN DU (fractional_remainder)
--      GIAM DAN - khong phai theo room_subtotal. Tie-breaker khi phan du
--      bang nhau: booking_id (khong dung room_id, vi 1 phong co the xuat
--      hien nhieu lan trong cung group - vd doi phong giua ky).
--   4. Phan 1 don vi (1 dong) cho tung booking dung thu tu buoc 3, cho den
--      khi phan bo het phan du cua group (remainder_units booking dau tien).
-- Day moi dung la "largest remainder" thuc su - phien ban truoc (gan toan
-- bo phan du vao 1 row co room_subtotal lon nhat) la "deterministic
-- remainder allocation", khong dung ten goi thuat toan kinh dien - da sua
-- theo dung gop y cua Hieu.
--
-- Neu group co room_subtotal tong = 0 (hiem, vd tat ca la 0), chia deu 1/n
-- cho phan floor, van ap dung largest-remainder cho phan du.
--
-- LUU Y QUAN TRONG VE KIEU DU LIEU (phat hien qua test, khong phai ly thuyet):
-- Postgres: sum(integer) -> bigint, NHUNG sum(bigint) -> numeric. Vi cac buoc
-- tinh trung gian (floor_share, allocated_net_revenue) da la bigint, sum()
-- cua chung trong SELECT cuoi cung se tu dong thanh numeric neu khong ep kieu
-- tuong minh. Da them ::bigint ngay tai sum(fa.allocated_net_revenue)::bigint
-- de giu dung schema output net_revenue = bigint nhu view cu. Da verify lai
-- qua pg_attribute sau khi sua - xem VERIFY SCHEMA o cuoi file.
--
-- LUU Y: groups.net_revenue thuc te la kieu integer (khong phai bigint nhu
-- mo ta cu trong Brain - da verify lai qua information_schema). SCHEMA OUTPUT
-- cua view (tung cot, tung kieu du lieu) GIU NGUYEN 100% so voi view cu -
-- da doi chieu tung cot qua pg_attribute/format_type truoc khi viet migration
-- nay, dac biet net_revenue van la bigint (SUM(integer) tu nhien tra bigint,
-- nhung o day phai ep tay vi chuoi tinh toan di qua bigint truoc).
--
-- DA TEST qua BEGIN...ROLLBACK (lan cuoi, sau khi sua loi kieu du lieu ::bigint):
--   - Schema: ca 13 cot khop 100% ten + kieu voi view cu, net_revenue = bigint (dung)
--   - Tong toan bo view = tong net_revenue duy nhat cua cac group co booking hop le (khop tuyet doi)
--   - Per-group (397 group thuc te): 0 group lech, max_abs_diff = NULL (khong co dong nao lech)
-- Xem VERIFY DONG o cuoi file - khong dua vao con so cu, luon chay lai ngay
-- khi apply that vi du lieu san xuat tiep tuc thay doi.

BEGIN;

CREATE OR REPLACE VIEW public.monthly_revenue
WITH (security_invoker = true) AS
WITH group_totals AS (
  -- Tong room_subtotal cua tung group (mau so phan bo ty trong)
  SELECT
    b.group_id,
    sum(b.room_subtotal) AS group_room_subtotal_sum,
    count(*) AS booking_count_in_group
  FROM public.bookings b
  WHERE b.is_deleted = false AND b.status <> 'cancelled'::booking_status
  GROUP BY b.group_id
),
raw_share AS (
  -- Ty trong (exact, chua lam tron) cua tung booking trong net_revenue cua group
  SELECT
    b.id AS booking_id,
    b.group_id,
    b.room_id,
    b.check_in,
    b.nights,
    b.room_subtotal,
    b.tax_amount,
    b.status,
    g.source,
    g.channel_fee_rate,
    g.net_revenue AS group_net_revenue,
    gt.group_room_subtotal_sum,
    gt.booking_count_in_group,
    CASE
      WHEN gt.group_room_subtotal_sum > 0 THEN
        g.net_revenue::numeric * b.room_subtotal / gt.group_room_subtotal_sum
      ELSE
        g.net_revenue::numeric / gt.booking_count_in_group
    END AS exact_share
  FROM public.bookings b
  JOIN public.groups g ON g.id = b.group_id
  JOIN group_totals gt ON gt.group_id = b.group_id
  WHERE b.is_deleted = false AND b.status <> 'cancelled'::booking_status
),
floored AS (
  SELECT
    rs.*,
    floor(rs.exact_share)::bigint AS floor_share,
    rs.exact_share - floor(rs.exact_share) AS fractional_remainder
  FROM raw_share rs
),
group_remainder AS (
  -- Phan du con lai (don vi nguyen, vd dong) sau khi da phan floor cho ca group.
  -- EP TUONG MINH ::bigint - neu khong, group_net_revenue(integer) - sum(floor_share)(bigint)
  -- se bi Postgres suy ra kieu numeric, lam doi schema output net_revenue cua view
  -- tu bigint thanh numeric (da phat hien qua test truc tiep, khong phai ly thuyet).
  SELECT
    f.group_id,
    (f.group_net_revenue::bigint - sum(f.floor_share))::bigint AS remainder_units
  FROM floored f
  GROUP BY f.group_id, f.group_net_revenue
),
ranked AS (
  -- Xep hang theo fractional_remainder GIAM DAN trong tung group; tie-breaker
  -- la booking_id (khong phai room_id) de dam bao thu tu xac dinh, khong phu
  -- thuoc phong nao - dung cho ca truong hop 1 phong xuat hien 2 lan/group.
  SELECT
    f.*,
    row_number() OVER (
      PARTITION BY f.group_id
      ORDER BY f.fractional_remainder DESC, f.booking_id
    ) AS remainder_rank
  FROM floored f
),
final_allocation AS (
  SELECT
    r.booking_id,
    r.group_id,
    r.room_id,
    r.check_in,
    r.nights,
    r.room_subtotal,
    r.tax_amount,
    r.status,
    r.source,
    r.channel_fee_rate,
    (r.floor_share
      + CASE
          WHEN r.remainder_rank <= (SELECT gr.remainder_units FROM group_remainder gr WHERE gr.group_id = r.group_id)
          THEN 1
          ELSE 0
        END)::bigint AS allocated_net_revenue
  FROM ranked r
)
SELECT
  date_trunc('month'::text, fa.check_in::timestamp with time zone)::date AS month,
  fa.source::text AS source,
  fa.room_id,
  count(*) AS booking_count,
  sum(fa.nights) AS total_nights,
  sum(fa.room_subtotal) AS gross_room_revenue,
  sum(fa.tax_amount) AS total_tax,
  sum(fa.allocated_net_revenue)::bigint AS net_revenue,
  round(avg(fa.channel_fee_rate), 3) AS avg_channel_fee_rate,
  count(*) FILTER (WHERE fa.status = 'checked-out'::booking_status) AS confirmed_count,
  count(*) FILTER (WHERE fa.status = ANY (ARRAY['booked'::booking_status, 'checked-in'::booking_status])) AS projected_count,
  sum(fa.room_subtotal) FILTER (WHERE fa.status = 'checked-out'::booking_status) AS confirmed_revenue,
  sum(fa.room_subtotal) FILTER (WHERE fa.status = ANY (ARRAY['booked'::booking_status, 'checked-in'::booking_status])) AS projected_revenue
FROM final_allocation fa
GROUP BY
  (date_trunc('month'::text, fa.check_in::timestamp with time zone)::date),
  (fa.source::text),
  fa.room_id
ORDER BY
  (date_trunc('month'::text, fa.check_in::timestamp with time zone)::date),
  (fa.source::text),
  fa.room_id;

REVOKE ALL ON public.monthly_revenue FROM PUBLIC, anon;

COMMIT;

-- VERIFY SCHEMA (chay ngay sau apply, phai khop 100% voi danh sach duoi day,
-- lay tu pg_attribute/format_type TRUOC khi sua - net_revenue phai la bigint):
--   month date, source text, room_id text, booking_count bigint,
--   total_nights bigint, gross_room_revenue bigint, total_tax bigint,
--   net_revenue bigint, avg_channel_fee_rate numeric, confirmed_count bigint,
--   projected_count bigint, confirmed_revenue bigint, projected_revenue bigint
--
-- SELECT a.attname, format_type(a.atttypid, a.atttypmod)
-- FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
-- WHERE c.relname = 'monthly_revenue' AND a.attnum > 0 AND NOT a.attisdropped
-- ORDER BY a.attnum;

-- VERIFY DONG (chay ngay, khong dua vao con so cu trong comment):
--
-- 1) Tong theo group_id (KHONG dung room_id IN (...) - 1 phong co the o
--    nhieu group khac nhau, khong the dai dien cho 1 group cu the):
--
-- WITH view_total AS (
--   SELECT sum(net_revenue) AS total FROM public.monthly_revenue
-- ),
-- unique_group_total AS (
--   SELECT sum(g.net_revenue) AS total
--   FROM public.groups g
--   WHERE EXISTS (
--     SELECT 1 FROM public.bookings b
--     WHERE b.group_id = g.id AND b.is_deleted = false
--       AND b.status <> 'cancelled'
--   )
-- )
-- SELECT (SELECT total FROM view_total) AS view_total,
--        (SELECT total FROM unique_group_total) AS unique_group_total,
--        (SELECT total FROM view_total) - (SELECT total FROM unique_group_total) AS diff;
-- Ky vong: diff = 0
--
-- 2) Kiem tra tung group rieng le bang group_id that (khong qua view da
--    GROUP BY - phai doc lai logic phan bo doc lap):
--
-- WITH group_totals2 AS (
--   SELECT b.group_id, sum(b.room_subtotal) AS grs, count(*) AS n
--   FROM public.bookings b
--   WHERE b.is_deleted = false AND b.status <> 'cancelled'
--   GROUP BY b.group_id
-- ),
-- raw_share2 AS (
--   SELECT b.id, b.group_id, g.net_revenue AS group_net_revenue,
--     CASE WHEN gt.grs > 0
--       THEN g.net_revenue::numeric * b.room_subtotal / gt.grs
--       ELSE g.net_revenue::numeric / gt.n
--     END AS exact_share
--   FROM public.bookings b
--   JOIN public.groups g ON g.id = b.group_id
--   JOIN group_totals2 gt ON gt.group_id = b.group_id
--   WHERE b.is_deleted = false AND b.status <> 'cancelled'
-- ),
-- floored2 AS (
--   SELECT *, floor(exact_share)::bigint AS floor_share,
--     exact_share - floor(exact_share) AS frac
--   FROM raw_share2
-- ),
-- group_rem2 AS (
--   SELECT group_id, group_net_revenue, group_net_revenue - sum(floor_share) AS rem_units
--   FROM floored2 GROUP BY group_id, group_net_revenue
-- ),
-- ranked2 AS (
--   SELECT f.*, row_number() OVER (PARTITION BY f.group_id ORDER BY f.frac DESC, f.id) AS rnk
--   FROM floored2 f
-- ),
-- per_group AS (
--   SELECT r.group_id, r.group_net_revenue,
--     sum(r.floor_share + CASE WHEN r.rnk <= gr.rem_units THEN 1 ELSE 0 END) AS alloc_total
--   FROM ranked2 r JOIN group_rem2 gr ON gr.group_id = r.group_id
--   GROUP BY r.group_id, r.group_net_revenue
-- )
-- SELECT count(*) AS so_group_lech, max(abs(group_net_revenue - alloc_total)) AS max_abs_diff
-- FROM per_group WHERE group_net_revenue <> alloc_total;
-- Ky vong: so_group_lech = 0, max_abs_diff = 0 (hoac NULL neu khong co group nao)
