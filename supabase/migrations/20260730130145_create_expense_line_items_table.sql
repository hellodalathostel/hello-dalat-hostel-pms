-- Bảng line-item cho expenses: lưu chi tiết giá vốn theo đơn vị nhỏ nhất (chai/hộp/cái...)
-- Mục đích khác expenses (tổng giao dịch dùng cho P&L/bank reconciliation):
-- bảng này phục vụ theo dõi biến động giá nhập theo SKU qua thời gian để rà soát sau.
CREATE TABLE public.expense_line_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  pack_unit text,                            -- đơn vị đóng gói trên phiếu: thùng/lốc/combo/hộp...
  pack_qty numeric NOT NULL DEFAULT 0,        -- số lượng mua theo pack_unit
  pack_price numeric NOT NULL DEFAULT 0,      -- đơn giá/pack_unit (giá niêm yết trên phiếu)
  units_per_pack numeric NOT NULL DEFAULT 1,  -- quy cách đóng gói: số đơn vị nhỏ nhất / pack
  smallest_unit text NOT NULL,                -- đơn vị nhỏ nhất: chai/cái/hộp...
  smallest_qty numeric GENERATED ALWAYS AS (pack_qty * units_per_pack) STORED,
  unit_cost_list numeric GENERATED ALWAYS AS (
    CASE WHEN units_per_pack = 0 THEN 0 ELSE round(pack_price / units_per_pack, 0) END
  ) STORED,                                   -- giá gốc/đơn vị nhỏ nhất, CHƯA phân bổ ship/voucher
  unit_cost_landed numeric,                   -- giá vốn thực tế/đơn vị nhỏ nhất (đã phân bổ ship+voucher nếu có)
  is_promo boolean NOT NULL DEFAULT false,    -- hàng tặng kèm/khuyến mãi (giá 0)
  source_ref text,                            -- số phiếu / mã đơn hàng
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_line_items_expense_id ON public.expense_line_items(expense_id);

ALTER TABLE public.expense_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_read ON public.expense_line_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY auth_write ON public.expense_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_line_items TO authenticated;
GRANT ALL ON public.expense_line_items TO service_role;
