-- booking_audit_log: lich su sua/huy/xoa booking. Owner-only, append-only.
-- Ghi bang trigger (bat moi duong ghi: 19 RPC + UPDATE truc tiep do policy auth_write).

CREATE TABLE public.booking_audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id uuid        NOT NULL,                 -- khong FK: log phai song sot khi hard delete
  at         timestamptz NOT NULL DEFAULT now(),
  actor_id   uuid,                                 -- auth.uid(); NULL = cron / service_role / SQL
  actor_role text,
  action     text        NOT NULL CHECK (action IN ('update', 'cancel', 'restore', 'delete')),
  changes    jsonb       NOT NULL,                 -- {cot: {old, new}}; delete: {row: {...}}
  source     text        NOT NULL DEFAULT 'direct' -- 'direct' = UPDATE khong qua RPC da gan nhan
);

CREATE INDEX idx_booking_audit_log_booking_at
  ON public.booking_audit_log (booking_id, at DESC);

-- ---------- Trigger function ----------
CREATE OR REPLACE FUNCTION public.log_booking_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cols     text[] := ARRAY[
    'room_id', 'check_in', 'check_out', 'price_per_night', 'guests_count',
    'guest_name', 'status', 'is_deleted', 'note', 'surcharge', 'tax_amount'
  ];
  v_old      jsonb;
  v_new      jsonb;
  v_changes  jsonb := '{}'::jsonb;
  v_action   text;
  v_dead_old boolean;
  v_dead_new boolean;
  k          text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.booking_audit_log (booking_id, actor_id, actor_role, action, changes, source)
    VALUES (
      OLD.id,
      auth.uid(),
      public.current_user_role()::text,
      'delete',
      jsonb_build_object('row', to_jsonb(OLD)),
      COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'direct')
    );
    RETURN OLD;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOREACH k IN ARRAY v_cols LOOP
    IF (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
      v_changes := v_changes || jsonb_build_object(
        k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k)
      );
    END IF;
  END LOOP;

  -- Khong co cot nghiep vu nao doi (vd chi updated_at / grand_total dan xuat) -> khong log
  IF v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_dead_old := (OLD.status::text = 'cancelled' OR OLD.is_deleted);
  v_dead_new := (NEW.status::text = 'cancelled' OR NEW.is_deleted);

  IF v_dead_new AND NOT v_dead_old THEN
    v_action := 'cancel';
  ELSIF v_dead_old AND NOT v_dead_new THEN
    v_action := 'restore';
  ELSE
    v_action := 'update';
  END IF;

  INSERT INTO public.booking_audit_log (booking_id, actor_id, actor_role, action, changes, source)
  VALUES (
    NEW.id,
    auth.uid(),
    public.current_user_role()::text,
    v_action,
    v_changes,
    COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'direct')
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_booking_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_bookings_audit
  AFTER UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_booking_audit();

-- ---------- RLS + GRANT (migration rule 30/05/2026) ----------
ALTER TABLE public.booking_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_audit_log TO authenticated;   -- RLS gioi han con owner
GRANT SELECT ON public.booking_audit_log TO service_role;

CREATE POLICY audit_owner_read ON public.booking_audit_log
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'owner');
-- Co y KHONG tao policy INSERT/UPDATE/DELETE: chi trigger (SECURITY DEFINER) ghi duoc.
