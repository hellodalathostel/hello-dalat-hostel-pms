-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 21/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================

-- Migration: create_inventory_management_tables
-- Ngày: 2026-08-21
-- Mục đích: Quản lý kho vật tư (mini bar, amenity, breakfast) + link tự động
-- với booking_services để tính giá vốn và trừ tồn kho khi bán.

CREATE TABLE public.inventory_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  unit text NOT NULL,
  category text NOT NULL,
  current_stock numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric,
  unit_cost integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_category_check
    CHECK (category IN ('mini_bar','amenity','breakfast','khac')),
  CONSTRAINT inventory_items_unit_cost_check CHECK (unit_cost >= 0)
);
COMMENT ON TABLE public.inventory_items IS 'Danh mục vật tư kho: mini bar, amenity, breakfast. current_stock chỉ được cập nhật qua trigger sync_inventory_current_stock, không UPDATE trực tiếp từ frontend.';

CREATE TABLE public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text NOT NULL REFERENCES public.inventory_items(id),
  type text NOT NULL,
  qty numeric NOT NULL,
  note text,
  booking_service_id uuid REFERENCES public.booking_services(id) ON DELETE SET NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_transactions_type_check
    CHECK (type IN ('nhap','xuat','dieu_chinh','xuat_tu_dong')),
  CONSTRAINT inventory_transactions_qty_check CHECK (qty > 0)
);
COMMENT ON TABLE public.inventory_transactions IS 'Log nhập/xuất/điều chỉnh kho. qty luôn dương — dấu +/- xác định bởi type trong trigger. booking_service_id chỉ set khi xuất tự động (type=xuat_tu_dong) hoặc hoàn kho (type=dieu_chinh khi xoá service).';

CREATE INDEX idx_inventory_transactions_item_id ON public.inventory_transactions(item_id);
CREATE INDEX idx_inventory_transactions_booking_service_id ON public.inventory_transactions(booking_service_id);

-- Trigger: cộng/trừ current_stock theo type. Cho phép âm — không chặn (quyết định 2026-08-21).
CREATE OR REPLACE FUNCTION public.sync_inventory_current_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.type IN ('nhap', 'dieu_chinh') THEN
    UPDATE inventory_items SET current_stock = current_stock + NEW.qty, updated_at = now()
    WHERE id = NEW.item_id;
  ELSIF NEW.type IN ('xuat', 'xuat_tu_dong') THEN
    UPDATE inventory_items SET current_stock = current_stock - NEW.qty, updated_at = now()
    WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_inventory_current_stock
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_current_stock();

-- Link service ↔ inventory item (nullable — chỉ set cho service có vật tư tiêu hao thật)
ALTER TABLE public.services ADD COLUMN inventory_item_id text REFERENCES public.inventory_items(id);
COMMENT ON COLUMN public.services.inventory_item_id IS 'Link tới inventory_items — chỉ set cho service loại own có vật tư tiêu hao (mini bar, breakfast). NULL cho service_type=partner hoặc service không có kho (vd giặt sấy).';

-- GRANT + RLS (bắt buộc theo migration rule 30/05/2026)
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transactions TO service_role;

-- Data access model hiện tại: Owner + Staff full CRUD, không phân quyền chi tiết
-- (khớp pattern policy "owner_write" ALL trên bảng services)
CREATE POLICY authenticated_full_access ON public.inventory_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.inventory_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.inventory_items FROM anon;
REVOKE ALL ON public.inventory_transactions FROM anon;
