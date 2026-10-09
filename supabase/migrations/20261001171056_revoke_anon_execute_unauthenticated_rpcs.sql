-- Gỡ quyền EXECUTE của anon/PUBLIC trên 5 RPC SECURITY DEFINER không kiểm tra auth.
-- authenticated và service_role giữ nguyên quyền riêng.
REVOKE EXECUTE ON FUNCTION public.create_inventory_item_txn(text,text,text,text,integer,numeric,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_inventory_item_txn(text,text,text,integer,numeric,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.toggle_inventory_item_active_txn(text,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_inventory_transaction_txn(text,text,numeric,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_log_for_date(date) FROM PUBLIC, anon;
