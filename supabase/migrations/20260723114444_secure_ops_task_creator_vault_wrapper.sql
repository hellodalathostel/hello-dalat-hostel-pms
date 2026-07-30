
-- Migration: secure_ops_task_creator_vault_wrapper
-- Muc dich: Va lo hong fail-open cua ops-task-creator (item 07 remediation).
-- Chuyen tu supabase_functions.http_request (headers literal, khong secret)
-- sang wrapper doc secret tu Vault + gui header x-webhook-secret.
-- Decision goc: brain.decisions 2026-07-15 "WEBHOOK_SECRET cho ops-task-creator: Vault + fail-closed"

-- ── Buoc 1: Tao Vault secret (gia tri random 32 byte hex) ──────────────
DO $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ops_task_webhook_secret') THEN
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(
      v_secret,
      'ops_task_webhook_secret',
      'Secret xac thuc DB webhook -> ops-task-creator Edge Function (header x-webhook-secret)'
    );
  END IF;
END $$;

-- ── Buoc 2: Wrapper trigger function ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.call_ops_task_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'net'
AS $function$
DECLARE
  v_secret text;
  v_url    text := 'https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/ops-task-creator';
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ops_task_webhook_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING '[call_ops_task_creator] Vault secret khong ton tai - bo qua goi webhook';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     => v_url,
    body    => jsonb_build_object(
                 'type',   'INSERT',
                 'table',  'bookings',
                 'schema', 'public',
                 'record', to_jsonb(NEW)
               ),
    headers => jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', v_secret
               ),
    timeout_milliseconds => 5000
  );

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.call_ops_task_creator() FROM PUBLIC;

-- ── Buoc 2b: Doi trigger sang wrapper ──────────────────────────────────
DROP TRIGGER IF EXISTS "ops-task-creator" ON public.bookings;

CREATE TRIGGER "ops-task-creator"
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.call_ops_task_creator();
