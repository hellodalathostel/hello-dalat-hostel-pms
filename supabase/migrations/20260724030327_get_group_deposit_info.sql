-- RPC read-only: gom thông tin 1 GROUP để deposit-sender dựng QR cọc.
-- Đơn vị = group. Chỉ service_role gọi (Edge Function backend).
-- Harden: search_path='' + fully-qualified tên bảng.

CREATE OR REPLACE FUNCTION public.get_group_deposit_info(p_group_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT json_build_object(
    'group_id',       g.id,
    'customer_name',  g.customer_name,
    'source',         g.source::text,
    'status',         g.status,
    'grand_total',    g.grand_total,               -- tổng CẢ GROUP (trigger-synced)
    -- Tổng giá 1 đêm đầu = SUM(price_per_night) booking active. Default cọc auto.
    'first_night_total', (SELECT COALESCE(SUM(b.price_per_night), 0)::integer
                          FROM public.bookings b
                          WHERE b.group_id = g.id
                            AND b.is_deleted = false
                            AND b.status <> 'cancelled'),
    'paid',           g.paid,
    -- Mã CK: code booking active đầu tiên (bỏ qua cancelled)
    'ref_code',       (SELECT b.code FROM public.bookings b
                       WHERE b.group_id = g.id
                         AND b.is_deleted = false
                         AND b.status <> 'cancelled'
                       ORDER BY b.created_at ASC LIMIT 1),
    -- Danh sách phòng active
    'rooms',          (SELECT json_agg(json_build_object(
                          'room_name', r.name,
                          'check_in',  to_char(b.check_in,  'DD/MM/YYYY'),
                          'check_out', to_char(b.check_out, 'DD/MM/YYYY'),
                          'nights',    b.nights
                        ) ORDER BY b.check_in)
                       FROM public.bookings b
                       LEFT JOIN public.rooms r ON r.id = b.room_id
                       WHERE b.group_id = g.id
                         AND b.is_deleted = false
                         AND b.status <> 'cancelled')
  )
  FROM public.groups g
  WHERE g.id = p_group_id AND g.is_deleted = false;
$$;

REVOKE ALL ON FUNCTION public.get_group_deposit_info(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_group_deposit_info(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_group_deposit_info(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_deposit_info(uuid) TO service_role;
