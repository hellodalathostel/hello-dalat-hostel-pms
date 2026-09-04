-- ============================================================================
-- KHOI PHUC TU supabase_migrations.schema_migrations NGAY 04/09/2026.
-- Migration nay DA APPLY tren production tu 21/08/2026.
-- File duoc ghi nguoc ra de repo khop voi DB — KHONG apply lai.
-- ============================================================================

-- Migration: create_inventory_management_rpcs
-- Ngày: 2026-08-21
-- Mục đích: RPC quản lý inventory_items + ghi transaction nhập/xuất/điều chỉnh tay.
-- Xuất tự động (xuat_tu_dong) chỉ được ghi từ add_booking_service_txn (migration riêng).

CREATE OR REPLACE FUNCTION public.create_inventory_item_txn(
  p_id text,
  p_name text,
  p_unit text,
  p_category text,
  p_unit_cost integer DEFAULT 0,
  p_low_stock_threshold numeric DEFAULT NULL,
  p_linked_service_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_category NOT IN ('mini_bar','amenity','breakfast','khac') THEN
    RAISE EXCEPTION 'INVALID_CATEGORY: %', p_category USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO inventory_items (id, name, unit, category, unit_cost, low_stock_threshold)
  VALUES (p_id, p_name, p_unit, p_category, p_unit_cost, p_low_stock_threshold);

  IF p_linked_service_id IS NOT NULL THEN
    UPDATE services SET inventory_item_id = p_id WHERE id = p_linked_service_id;
  END IF;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'id', p_id);
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_inventory_item_txn(
  p_id text,
  p_name text DEFAULT NULL,
  p_unit text DEFAULT NULL,
  p_unit_cost integer DEFAULT NULL,
  p_low_stock_threshold numeric DEFAULT NULL,
  p_low_stock_threshold_set boolean DEFAULT FALSE
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE inventory_items
  SET name = COALESCE(p_name, name),
      unit = COALESCE(p_unit, unit),
      unit_cost = COALESCE(p_unit_cost, unit_cost),
      low_stock_threshold = CASE WHEN p_low_stock_threshold_set THEN p_low_stock_threshold ELSE low_stock_threshold END,
      updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: %', p_id USING ERRCODE = 'P0001';
  END IF;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'id', p_id);
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_inventory_item_active_txn(
  p_id text,
  p_is_active boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE inventory_items SET is_active = p_is_active, updated_at = now() WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: %', p_id USING ERRCODE = 'P0001';
  END IF;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'id', p_id, 'is_active', p_is_active);
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_inventory_transaction_txn(
  p_item_id text,
  p_type text,
  p_qty numeric,
  p_note text DEFAULT NULL,
  p_created_by text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  IF p_type NOT IN ('nhap','xuat','dieu_chinh') THEN
    RAISE EXCEPTION 'INVALID_TYPE: chỉ nhập tay dùng nhap/xuat/dieu_chinh, không dùng xuat_tu_dong' USING ERRCODE = 'P0001';
  END IF;

  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QTY: qty phải > 0' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM inventory_items WHERE id = p_item_id) THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: %', p_item_id USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO inventory_transactions (item_id, type, qty, note, created_by)
  VALUES (p_item_id, p_type, p_qty, p_note, p_created_by)
  RETURNING id INTO v_new_id;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'transaction_id', v_new_id);
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$$;
