-- Migration: revoke_anon_execute_business_rpcs
-- Muc dich: dong lo hong anon EXECUTE tren cac RPC mutation nghiep vu.
-- Giu nguyen anon cho: check_room_availability, get_suggested_price, current_user_role
-- (2 cai dau tam giu theo yeu cau Hieu, can verify landing page truoc khi revoke tiep)
BEGIN;

-- Booking lifecycle
REVOKE EXECUTE ON FUNCTION public.add_booking_to_group_txn(uuid, text, date, date, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_booking_txn(uuid, text, date, date, integer, integer, text, text, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.checkin_booking_txn(uuid, json) FROM anon;
REVOKE EXECUTE ON FUNCTION public.checkout_booking_txn(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.checkout_group_txn(uuid, uuid[], integer, payment_method, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_checkedout_booking_txn(uuid, text) FROM anon;

-- Rooms
REVOKE EXECUTE ON FUNCTION public.cancel_ota_block(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_room_block_txn(text, date, date, block_reason, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_room_block_txn(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_housekeeping_status(text, housekeeping_status, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_room_issue_txn(text, text, text) FROM anon;

-- Services / Discounts / Fees
REVOKE EXECUTE ON FUNCTION public.add_early_late_txn(uuid, text, integer) FROM anon;

-- Payment
REVOKE EXECUTE ON FUNCTION public.record_payment_txn(uuid, integer, payment_method, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_payment_txn(uuid, text) FROM anon;

-- Finance / Docs
REVOKE EXECUTE ON FUNCTION public.create_manual_revenue_txn(date, text, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_document_log(uuid, uuid, doc_kind, doc_format, jsonb, text, text, text, text) FROM anon;

-- Brain embed (system-level, khong phai guest-facing, khong can anon)
REVOKE EXECUTE ON FUNCTION public.brain_embed_get_missing(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.brain_embed_set_embedding(text, uuid, vector) FROM anon;

COMMIT;
