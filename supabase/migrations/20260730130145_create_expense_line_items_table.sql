-- Reconstructed 2026-07-31 from live schema introspection: this migration was
-- applied directly to production (not via a local migration file), so the
-- original SQL text was never captured in git. Columns, indexes, RLS,
-- policies, and grants below match the live table exactly (verified via
-- information_schema / pg_indexes / pg_policies / pg_constraint).

CREATE TABLE public.expense_line_items (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id        uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  item_name         text NOT NULL,
  pack_unit         text,
  pack_qty          numeric NOT NULL DEFAULT 0,
  pack_price        numeric NOT NULL DEFAULT 0,
  units_per_pack    numeric NOT NULL DEFAULT 1,
  smallest_unit     text NOT NULL,
  smallest_qty      numeric,
  unit_cost_list    numeric,
  unit_cost_landed  numeric,
  is_promo          boolean NOT NULL DEFAULT false,
  source_ref        text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_line_items_expense_id ON public.expense_line_items (expense_id);

ALTER TABLE public.expense_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_read  ON public.expense_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_write ON public.expense_line_items FOR ALL    TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.expense_line_items TO anon;
GRANT ALL ON public.expense_line_items TO authenticated;
GRANT ALL ON public.expense_line_items TO service_role;
