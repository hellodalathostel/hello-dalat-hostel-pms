
-- Dọn dẹp legacy RPC: process_checkin, process_check_in_txn, process_check_out_txn
-- Xác nhận qua grep (2026-06-18): không còn call site nào trong src/ hay supabase/functions/.
-- RPC canonical đang dùng thật: checkin_booking_txn, checkout_booking_txn.
-- process_checkout (không suffix) không tồn tại trong pg_proc — không cần DROP.

DROP FUNCTION IF EXISTS public.process_checkin(p_booking_id uuid);
DROP FUNCTION IF EXISTS public.process_check_in_txn(p_booking_id uuid, p_guests jsonb);
DROP FUNCTION IF EXISTS public.process_check_out_txn(p_booking_id uuid, p_confirm_debt boolean);
