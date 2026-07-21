-- Migration: tao bang ops_tasks thay the Notion Task DB cho Telegram bot
-- Ap dung nguyen tac #5: GRANT explicit + RLS bat buoc

CREATE TABLE public.ops_tasks (
  id              BIGSERIAL PRIMARY KEY,
  task_name       TEXT NOT NULL,
  task_date       DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  loai            TEXT NOT NULL DEFAULT 'Khac'
                    CHECK (loai IN ('Don Phong','Check-in/out','Bao Tri','Mua Sam','Admin','Khac')),
  priority        TEXT NOT NULL DEFAULT 'Binh Thuong'
                    CHECK (priority IN ('Khan','Cao','Binh Thuong','Thap')),
  status          TEXT NOT NULL DEFAULT 'Can Lam'
                    CHECK (status IN ('Can Lam','Dang Lam','Hoan Thanh','Bo Qua')),
  room_id         TEXT REFERENCES public.rooms(id),
  nguoi_thuc_hien TEXT DEFAULT 'Loi',
  ghi_chu         TEXT,
  created_by      TEXT DEFAULT 'staff_telegram',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ops_tasks_date_status ON public.ops_tasks(task_date, status);
CREATE INDEX idx_ops_tasks_room ON public.ops_tasks(room_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_ops_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ops_tasks_updated_at
  BEFORE UPDATE ON public.ops_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_ops_tasks_updated_at();

-- GRANT explicit (bat buoc theo nguyen tac #5)
GRANT SELECT, INSERT, UPDATE ON public.ops_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ops_tasks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ops_tasks_id_seq TO authenticated, service_role;

-- Enable RLS (bat buoc theo nguyen tac #5)
ALTER TABLE public.ops_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_tasks_select_authenticated" ON public.ops_tasks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "ops_tasks_insert_authenticated" ON public.ops_tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "ops_tasks_update_authenticated" ON public.ops_tasks
  FOR UPDATE USING (auth.role() = 'authenticated');
