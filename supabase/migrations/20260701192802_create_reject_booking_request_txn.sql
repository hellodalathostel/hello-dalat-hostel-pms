-- supabase/migrations/20260701192802_create_reject_booking_request_txn.sql
-- useRejectRequest() trước đó update trực tiếp booking_requests.status (bypass RPC).
-- Gộp vào RPC transactional để lock row (FOR UPDATE) chặn race condition với confirm,
-- và chặn reject request đã ở trạng thái khác 'pending'.

CREATE OR REPLACE FUNCTION public.reject_booking_request_txn(
  p_request_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request RECORD;
BEGIN
  -- Lock row để chặn race condition (confirm và reject cùng lúc)
  SELECT id, status
    INTO v_request
    FROM booking_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: %', p_request_id USING ERRCODE = 'P0001';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'REQUEST_ALREADY_PROCESSED: request % đã ở trạng thái %, không thể reject',
      p_request_id, v_request.status USING ERRCODE = 'P0002';
  END IF;

  UPDATE booking_requests
     SET status = 'rejected',
         rejected_reason = p_reason,
         updated_at = NOW()
   WHERE id = p_request_id;

  RETURN JSON_BUILD_OBJECT(
    'success', TRUE,
    'request_id', p_request_id
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

-- Grant thực thi cho cả 2 role (đúng data access model: Owner + Staff full CRUD)
GRANT EXECUTE ON FUNCTION public.reject_booking_request_txn(UUID, TEXT) TO authenticated;

-- Chặn PUBLIC/anon gọi trực tiếp RPC này khi chưa đăng nhập (Postgres grant EXECUTE cho
-- PUBLIC theo default khi tạo function, anon kế thừa qua đó nếu không revoke rõ ràng)
REVOKE EXECUTE ON FUNCTION public.reject_booking_request_txn(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_booking_request_txn(UUID, TEXT) FROM anon;
