-- Revoke direct write từ authenticated trên bảng nhạy cảm
-- Giữ SELECT cho authenticated; mọi write bắt buộc qua RPC SECURITY DEFINER
-- Verified: 9/9 RPC liên quan (create_group_booking_txn, update_booking_txn,
-- process_check_in_txn/checkin_booking_txn, checkout_booking_txn, checkout_group_txn,
-- record_payment_txn, void_checkedout_booking_txn, create_document_log, current_user_role)
-- đều SECURITY DEFINER, owner postgres — không bị ảnh hưởng bởi revoke này.

REVOKE INSERT, UPDATE, DELETE ON public.bookings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.customers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.groups FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.booking_guests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.booking_services FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.booking_discounts FROM authenticated;

-- Đảm bảo service_role vẫn full quyền (không phụ thuộc revoke trên)
GRANT INSERT, UPDATE, DELETE ON public.bookings TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.customers TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.payment_history TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.groups TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.booking_guests TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.booking_services TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.booking_discounts TO service_role;
