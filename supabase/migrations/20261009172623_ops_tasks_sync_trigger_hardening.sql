-- Chunk 1c (Hieu duyet 09/10/2026): 2 chinh sua nho cho sync_ops_tasks_on_booking_update().
-- (1) Them guard TG_OP: ham chi hop le cho UPDATE (dung OLD), thoat som neu bi gan nham trigger khac.
-- (2) Khi huy/xoa booking chi chuyen task 'Can Lam' -> 'Bo Qua'; task 'Dang Lam' (Loi dang lam do) giu nguyen, khong skip am tham.
-- Nhanh khoi phuc va nhanh doi phong/ngay giu nguyen. Khong doi trigger, khong doi index.
-- ROLLBACK: chay lai CREATE OR REPLACE voi ban cu (status IN ('Can Lam','Dang Lam') o nhanh huy, khong co guard TG_OP).

CREATE OR REPLACE FUNCTION public.sync_ops_tasks_on_booking_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dead_new boolean := (NEW.status::text = 'cancelled' OR NEW.is_deleted);
  v_dead_old boolean := (OLD.status::text = 'cancelled' OR OLD.is_deleted);
BEGIN
  -- Guard: ham nay dung OLD nen chi hop le voi UPDATE
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF v_dead_new AND NOT v_dead_old THEN
    -- Chi dong task chua bat dau; task Dang Lam giu nguyen
    UPDATE public.ops_tasks SET status = 'Bo Qua', ghi_chu = 'AUTO: booking huy/xoa'
    WHERE booking_id = NEW.id AND status = 'Can Lam';
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
$function$;
