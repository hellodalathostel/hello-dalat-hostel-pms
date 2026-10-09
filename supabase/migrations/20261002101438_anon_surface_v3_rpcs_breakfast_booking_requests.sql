-- 20261002_anon_surface_v3 (Hieu duyet 02/10/2026; dry-run duoi role anon dat)
-- 1. Ba RPC: cap tuong minh cho authenticated + service_role roi moi go anon / PUBLIC
GRANT EXECUTE ON FUNCTION public.get_suggested_price(text, date)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_breakfast_unit_cost(date)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_room_availability(text, date, date, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_suggested_price(text, date)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_breakfast_unit_cost(date)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_room_availability(text, date, date, uuid) FROM PUBLIC, anon;

-- 2. breakfast_*: go SELECT cua anon (authenticated giu nguyen)
REVOKE ALL ON TABLE public.breakfast_daily_snapshot FROM anon;
REVOKE ALL ON TABLE public.breakfast_price_history  FROM anon;

-- 3. booking_requests: anon chi INSERT cac cot cua form, policy chan du lieu ban
DROP POLICY anon_insert_booking_request ON public.booking_requests;
REVOKE ALL ON TABLE public.booking_requests FROM anon;
GRANT INSERT (name, phone, email, room_id, check_in, check_out, note, status)
  ON public.booking_requests TO anon;

CREATE POLICY anon_insert_booking_request ON public.booking_requests
  FOR INSERT TO anon
  WITH CHECK (
    status = 'pending'::booking_request_status
    AND converted_group_id IS NULL AND rejected_reason IS NULL
    AND char_length(name)  BETWEEN 1 AND 200
    AND char_length(phone) BETWEEN 5 AND 40
    AND (email IS NULL OR char_length(email) <= 320)
    AND (note  IS NULL OR char_length(note)  <= 2000)
    AND check_in  >= CURRENT_DATE - 1
    AND check_out <= check_in + 90
  );
