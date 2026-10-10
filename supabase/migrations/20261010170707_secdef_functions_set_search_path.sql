-- Chot search_path cho 5 ham SECURITY DEFINER con thieu (code scanning PR #16).
-- update_booking_txn mat SET search_path tu 20260705123606 (DROP + CREATE lai khong co SET).
-- ALTER FUNCTION: giu nguyen than ham va GRANT; pg_temp dat cuoi de khong che duoc ten.
ALTER FUNCTION public.current_user_role()
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.update_booking_txn(uuid, text, date, date, integer, integer, text, text, boolean, boolean)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.add_booking_to_group_txn(uuid, text, date, date, integer, integer, text)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.checkout_group_txn(uuid, uuid[], integer, payment_method, text)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.update_housekeeping_status(text, housekeeping_status, text)
  SET search_path TO 'public', 'pg_temp';
