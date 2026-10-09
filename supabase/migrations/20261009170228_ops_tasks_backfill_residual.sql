-- Chunk 1 phan con thieu (duyet 09/10/2026): backfill bo sung cho migration 20261002094956.
-- Khong tao trigger/index/function moi. Chi du lieu: task mo cua booking da huy, task mo coi/trung, task con thieu.

-- R2. Task con mo (tuong lai) cua booking da huy/xoa -> Bo Qua (marker trung voi trigger sync de co the khoi phuc)
UPDATE public.ops_tasks t
SET status = 'Bo Qua',
    ghi_chu = COALESCE(t.ghi_chu, 'AUTO: booking huy/xoa')
FROM public.bookings b
WHERE b.id = t.booking_id
  AND t.status = 'Can Lam'
  AND t.loai IN ('Check-in/out', 'Don Phong')
  AND t.task_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  AND (b.status = 'cancelled' OR b.is_deleted);

-- R3. Task tu dong con mo (tuong lai) khong gan duoc booking nao (mo coi hoac ban trung) -> Bo Qua
UPDATE public.ops_tasks
SET status = 'Bo Qua',
    ghi_chu = COALESCE(ghi_chu, 'AUTO: khong con booking khop')
WHERE booking_id IS NULL
  AND status = 'Can Lam'
  AND loai IN ('Check-in/out', 'Don Phong')
  AND created_by IN ('trigger_bookings', 'ops-task-creator')
  AND task_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

-- R4. Bo sung task con thieu cho booking active chua co task loai do (vd booking da doi ngay truoc khi co trigger sync)
--     chr(242) = o co dau huyen trong "phong" cua task Check-in/out (giu y ban trigger hien tai)
INSERT INTO public.ops_tasks (task_name, task_date, loai, room_id, booking_id, created_by)
SELECT CASE l.loai
         WHEN 'Check-in/out' THEN 'Check-in/out ph' || chr(242) || 'ng ' || b.room_id
         ELSE 'Don phong ' || b.room_id
       END,
       b.check_in, l.loai, b.room_id, b.id, 'trigger_bookings'
FROM public.bookings b
CROSS JOIN (VALUES ('Check-in/out'), ('Don Phong')) AS l(loai)
WHERE b.status IN ('booked', 'checked-in')
  AND b.is_deleted = false
  AND b.check_in >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  AND NOT EXISTS (
    SELECT 1 FROM public.ops_tasks t WHERE t.booking_id = b.id AND t.loai = l.loai
  );
