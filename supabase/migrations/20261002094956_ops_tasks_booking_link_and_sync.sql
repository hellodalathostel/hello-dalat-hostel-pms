-- Chunk 1 (quyet dinh 02/10/2026): vong doi ops_tasks theo booking
-- 1. Cot booking_id + FK (ON DELETE SET NULL: xoa cung booking khong mat task)
ALTER TABLE public.ops_tasks
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

-- 2. Backfill chi nhung task khop DUY NHAT 1 booking (room_id + check_in = task_date),
--    va chi task dau tien trong moi nhom (room, ngay, loai). Task trung / mo ho de NULL.
--    Tat trigger updated_at de khong ghi de updated_at cua 377 dong.
ALTER TABLE public.ops_tasks DISABLE TRIGGER trg_ops_tasks_updated_at;
WITH t AS (
  SELECT id, room_id, task_date, loai,
         row_number() OVER (PARTITION BY room_id, task_date, loai ORDER BY id) AS rn
  FROM public.ops_tasks
  WHERE created_by IN ('trigger_bookings','ops-task-creator') AND booking_id IS NULL
),
cand AS (
  SELECT t.id AS task_id, t.rn, count(b.id) AS n_b, (array_agg(b.id))[1] AS booking_id
  FROM t JOIN public.bookings b ON b.room_id = t.room_id AND b.check_in = t.task_date
  GROUP BY t.id, t.rn
)
UPDATE public.ops_tasks o SET booking_id = c.booking_id
FROM cand c WHERE o.id = c.task_id AND c.n_b = 1 AND c.rn = 1;
ALTER TABLE public.ops_tasks ENABLE TRIGGER trg_ops_tasks_updated_at;

-- 3. Unique key: mot booking co toi da 1 task moi loai
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_tasks_booking_loai
  ON public.ops_tasks (booking_id, loai) WHERE booking_id IS NOT NULL;

-- 4. Trigger AFTER INSERT: gan booking_id, chong trung bang ON CONFLICT.
--    Task_name giu y nguyen ban cu (chr(242) = o co dau huyen trong "phong" cua task Check-in/out).
CREATE OR REPLACE FUNCTION public.call_ops_task_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_status text := CASE WHEN (NEW.status::text = 'cancelled' OR NEW.is_deleted) THEN 'Bo Qua' ELSE 'Can Lam' END;
  v_note   text := CASE WHEN (NEW.status::text = 'cancelled' OR NEW.is_deleted) THEN 'AUTO: booking huy/xoa' ELSE NULL END;
BEGIN
  INSERT INTO public.ops_tasks (task_name, task_date, loai, room_id, created_by, booking_id, status, ghi_chu)
  VALUES ('Check-in/out ph' || chr(242) || 'ng ' || NEW.room_id, NEW.check_in, 'Check-in/out', NEW.room_id,
          'trigger_bookings', NEW.id, v_status, v_note)
  ON CONFLICT (booking_id, loai) WHERE booking_id IS NOT NULL DO NOTHING;

  INSERT INTO public.ops_tasks (task_name, task_date, loai, room_id, created_by, booking_id, status, ghi_chu)
  VALUES ('Don phong ' || NEW.room_id, NEW.check_in, 'Don Phong', NEW.room_id,
          'trigger_bookings', NEW.id, v_status, v_note)
  ON CONFLICT (booking_id, loai) WHERE booking_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$f$;

-- 5. Trigger AFTER UPDATE: huy/xoa -> Bo Qua; mo lai -> Can Lam (chi task do trigger tu Bo Qua);
--    doi phong/check_in -> dong bo task con mo. Task Hoan Thanh khong bao gio bi dong.
CREATE OR REPLACE FUNCTION public.sync_ops_tasks_on_booking_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_dead_new boolean := (NEW.status::text = 'cancelled' OR NEW.is_deleted);
  v_dead_old boolean := (OLD.status::text = 'cancelled' OR OLD.is_deleted);
BEGIN
  IF v_dead_new AND NOT v_dead_old THEN
    UPDATE public.ops_tasks SET status = 'Bo Qua', ghi_chu = 'AUTO: booking huy/xoa'
    WHERE booking_id = NEW.id AND status IN ('Can Lam', 'Dang Lam');
  ELSIF v_dead_old AND NOT v_dead_new THEN
    UPDATE public.ops_tasks SET status = 'Can Lam', ghi_chu = NULL
    WHERE booking_id = NEW.id AND status = 'Bo Qua' AND ghi_chu = 'AUTO: booking huy/xoa';
  END IF;

  IF NOT v_dead_new AND (OLD.room_id IS DISTINCT FROM NEW.room_id OR OLD.check_in IS DISTINCT FROM NEW.check_in) THEN
    UPDATE public.ops_tasks
    SET room_id   = NEW.room_id,
        task_date = NEW.check_in,
        task_name = CASE loai
                      WHEN 'Check-in/out' THEN 'Check-in/out ph' || chr(242) || 'ng ' || NEW.room_id
                      WHEN 'Don Phong'    THEN 'Don phong ' || NEW.room_id
                      ELSE task_name
                    END
    WHERE booking_id = NEW.id AND status IN ('Can Lam', 'Dang Lam');
  END IF;

  RETURN NEW;
END;
$f$;

-- Ham trigger noi bo: khong cho anon/authenticated/PUBLIC goi (rule REVOKE anon cho object moi)
REVOKE ALL ON FUNCTION public.sync_ops_tasks_on_booking_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_ops_tasks_sync_on_booking_update
AFTER UPDATE OF room_id, check_in, status, is_deleted ON public.bookings
FOR EACH ROW
WHEN (OLD.room_id IS DISTINCT FROM NEW.room_id
   OR OLD.check_in IS DISTINCT FROM NEW.check_in
   OR OLD.status IS DISTINCT FROM NEW.status
   OR OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
EXECUTE FUNCTION public.sync_ops_tasks_on_booking_update();
