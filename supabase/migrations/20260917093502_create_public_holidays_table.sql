-- Migration: create_public_holidays_table
-- Muc dich: bang reference luu ngay le/nghi bu VN, dung de highlight tren tab Lich.

CREATE TABLE IF NOT EXISTS public.holidays (
  date date PRIMARY KEY,
  name text NOT NULL,
  is_makeup_day boolean NOT NULL DEFAULT false,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.holidays IS 'Ngay le/nghi bu chinh thuc VN - dung de highlight tren tab Lich. Khong dung cho pricing (xem brain.knowledge).';

-- RLS: Owner + Staff full CRUD, khong role-check (theo nguyen tac #3)
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON public.holidays
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- GRANT explicit (bat buoc theo nguyen tac #5)
GRANT SELECT ON public.holidays TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;

-- Seed du lieu 2026 (nguon: Bo luat Lao dong 2019 Dieu 112 + Thong bao 9441/TB-BNV/2025,
-- phuong an khoi tu nhan, da chot voi Hieu 2026-09-17)
INSERT INTO public.holidays (date, name, is_makeup_day, note) VALUES
  ('2026-01-01', 'Tết Dương lịch', false, null),
  ('2026-02-16', 'Tết Nguyên Đán', false, '29 Tết'),
  ('2026-02-17', 'Tết Nguyên Đán', false, '30 Tết'),
  ('2026-02-18', 'Tết Nguyên Đán', false, 'Mùng 1 Tết'),
  ('2026-02-19', 'Tết Nguyên Đán', false, 'Mùng 2 Tết'),
  ('2026-02-20', 'Tết Nguyên Đán', false, 'Mùng 3 Tết'),
  ('2026-04-26', 'Giỗ Tổ Hùng Vương', false, '10/3 âm lịch, rơi Chủ Nhật'),
  ('2026-04-27', 'Nghỉ bù Giỗ Tổ Hùng Vương', true, null),
  ('2026-04-30', 'Ngày Giải phóng miền Nam', false, null),
  ('2026-05-01', 'Quốc tế Lao động', false, null),
  ('2026-09-01', 'Quốc khánh', false, null),
  ('2026-09-02', 'Quốc khánh', false, null),
  ('2026-11-24', 'Ngày Văn hóa Việt Nam', false, 'Lễ mới từ 2026, Nghị quyết 80-NQ/TW')
ON CONFLICT (date) DO NOTHING;
