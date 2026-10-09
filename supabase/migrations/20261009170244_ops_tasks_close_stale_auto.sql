-- Chunk 1b (Hieu duyet 09/10/2026): don task tu dong qua han. Khong xoa dong nao, chi doi status + marker de hoan tac.
-- Pham vi do truoc khi chay: 469 task Can Lam co task_date < hom nay, 100% created_by trigger_bookings / ops-task-creator, 0 task thu cong.
UPDATE public.ops_tasks
SET status = 'Bo Qua',
    ghi_chu = COALESCE(ghi_chu, '[auto] qua han, don 2026-10-09')
WHERE status = 'Can Lam'
  AND task_date < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  AND created_by IN ('trigger_bookings', 'ops-task-creator');

-- ROLLBACK (chay tay neu can):
-- UPDATE public.ops_tasks SET status = 'Can Lam', ghi_chu = NULL WHERE ghi_chu = '[auto] qua han, don 2026-10-09';
