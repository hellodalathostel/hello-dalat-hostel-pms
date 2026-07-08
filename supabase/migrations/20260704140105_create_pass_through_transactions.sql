-- Bảng cho các khoản thu hộ/chi hộ (không tính vào P&L hostel)
-- VD: thu tiền tour khách rồi thanh toán lại cho đối tác tour (VietChallenge, Ms. Thu)
CREATE TABLE public.pass_through_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  direction TEXT NOT NULL CHECK (direction IN ('collected', 'paid_out')), -- collected = thu hộ từ khách, paid_out = trả lại đối tác
  partner_name TEXT NOT NULL, -- VD: 'VietChallenge Tours', 'Ms. Thu'
  amount INTEGER NOT NULL,
  transaction_date DATE NOT NULL,
  payment_method TEXT,
  reference_code TEXT, -- mã tham chiếu ngân hàng
  related_booking_id UUID REFERENCES public.bookings(id), -- optional, link tới booking nếu có
  note TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pass_through_partner ON public.pass_through_transactions(partner_name);
CREATE INDEX idx_pass_through_date ON public.pass_through_transactions(transaction_date);

-- Migration rule bắt buộc: GRANT + RLS
ALTER TABLE public.pass_through_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pass_through_transactions TO service_role;
GRANT SELECT ON public.pass_through_transactions TO authenticated;

CREATE POLICY "service_role_full_access" ON public.pass_through_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read" ON public.pass_through_transactions
  FOR SELECT TO authenticated USING (true);
