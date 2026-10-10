-- Bo sung 5 cot nghiep vu vao whitelist audit (Codex review PR #16):
-- update_booking_breakfast_txn chi doi has_breakfast/breakfast_type/breakfast_qty_per_night,
-- add_early_late_txn/undo_early_late_txn chi doi has_early_check_in/has_late_check_out
-- -> truoc day v_changes rong, khong co dong log.
-- CREATE OR REPLACE reset SET options: giu lai search_path (public, pg_temp). ACL giu nguyen.
CREATE OR REPLACE FUNCTION public.log_booking_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cols     text[] := ARRAY[
    'room_id', 'check_in', 'check_out', 'price_per_night', 'guests_count',
    'guest_name', 'status', 'is_deleted', 'note', 'surcharge', 'tax_amount',
    'has_breakfast', 'breakfast_type', 'breakfast_qty_per_night',
    'has_early_check_in', 'has_late_check_out'
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
