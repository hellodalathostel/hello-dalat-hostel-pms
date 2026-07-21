-- RPC reject_booking_request_txn: chuẩn hóa reject path để nhất quán với confirm_booking_request_txn
-- Trước đây frontend .update() trực tiếp lên booking_requests (useBookingRequests.ts:80-83) — không lock row, không kiểm tra status

CREATE OR REPLACE FUNCTION public.reject_booking_request_txn(p_request_id uuid, p_reason text DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request RECORD;
BEGIN
  -- Lock row để chặn race condition (confirm và reject bấm gần như cùng lúc)
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

-- GRANT execute — theo đúng pattern confirm_booking_request_txn (postgres, authenticated, service_role)
GRANT EXECUTE ON FUNCTION public.reject_booking_request_txn(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_booking_request_txn(uuid, text) TO service_role;
