-- Thong bao Telegram khi co yeu cau dat phong moi.
-- Bat moi duong INSERT (landing page ghi truc tiep bang anon key).
-- Secret doc tu Vault (name = 'booking_notify_secret'), khong nam trong git.
-- Loi gui tin KHONG duoc lam hong INSERT cua khach -> EXCEPTION WHEN OTHERS.

CREATE OR REPLACE FUNCTION public.notify_booking_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'booking_notify_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_booking_request: thieu vault secret booking_notify_secret';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/notify-booking-request',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := jsonb_build_object('request_id', NEW.id),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_booking_request loi: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_booking_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_booking_requests_notify ON public.booking_requests;
CREATE TRIGGER trg_booking_requests_notify
  AFTER INSERT ON public.booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_booking_request();
