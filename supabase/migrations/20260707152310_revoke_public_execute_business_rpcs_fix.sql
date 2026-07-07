BEGIN;

REVOKE EXECUTE ON FUNCTION public.checkin_booking_txn(uuid, json) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.checkout_booking_txn(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.checkout_group_txn(uuid, uuid[], integer, payment_method, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.void_checkedout_booking_txn(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_ota_block(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_room_block_txn(text, date, date, block_reason, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_room_block_txn(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_housekeeping_status(text, housekeeping_status, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_room_issue_txn(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_early_late_txn(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_payment_txn(uuid, integer, payment_method, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.void_payment_txn(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_manual_revenue_txn(date, text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_document_log(uuid, uuid, doc_kind, doc_format, jsonb, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.brain_embed_get_missing(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.brain_embed_set_embedding(text, uuid, vector) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.checkin_booking_txn(uuid, json) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.checkout_booking_txn(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.checkout_group_txn(uuid, uuid[], integer, payment_method, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_checkedout_booking_txn(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_ota_block(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_room_block_txn(text, date, date, block_reason, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_room_block_txn(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_housekeeping_status(text, housekeeping_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_room_issue_txn(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_early_late_txn(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_txn(uuid, integer, payment_method, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_payment_txn(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_revenue_txn(date, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_document_log(uuid, uuid, doc_kind, doc_format, jsonb, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brain_embed_get_missing(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.brain_embed_set_embedding(text, uuid, vector) TO service_role;

COMMIT;
