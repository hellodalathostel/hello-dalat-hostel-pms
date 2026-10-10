-- Dong bo repo voi production: checkout_booking_txn / checkout_group_txn la legacy
-- (app dung checkout_single_booking_txn / checkout_last_booking_and_settle_txn).
-- 20260707152310 da GRANT cho authenticated, service_role; production da thu hoi ngoai migration.
-- No-op tren production, chan viec mo lai khi replay migration.
REVOKE EXECUTE ON FUNCTION public.checkout_booking_txn(uuid) FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.checkout_group_txn(uuid, uuid[], integer, payment_method, text) FROM authenticated, service_role;
