# Hướng dẫn Tạo RPC Functions Cho Room Blocks

## 📋 Tóm tắt
Do vấn đề migration history mismatch trên Supabase, bạn cần thực hiện các SQL statements bên dưới **trực tiếp** trong Supabase Studio SQL Editor để tạo RPC functions.

---

## 🔧 Cách Thực Hiện

### Bước 1: Truy cập Supabase Studio
1. Mở [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Chọn project **hello-dalat-hostel-pms**
3. Vào tab **SQL Editor**

### Bước 2: Copy & Paste SQL
Copy toàn bộ code bên dưới (từ `-- RPC function để tạo room block` đến `END;$$;`) vào SQL Editor

### Bước 3: Chạy SQL
Nhấn nút **▶️ Run** hoặc Ctrl+Enter để execute

### Bước 4: Xác Nhận
Thấy kết quả "Query executed successfully" = ✅ Thành công

---

## 📝 SQL Code

```sql
-- RPC function để tạo room block
CREATE OR REPLACE FUNCTION create_room_block_txn(
  p_room_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_reason block_reason DEFAULT 'other',
  p_note TEXT DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block_id UUID;
BEGIN
  -- Validate input
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Start date and end date are required';
  END IF;

  IF p_start_date >= p_end_date THEN
    RAISE EXCEPTION 'Start date must be before end date';
  END IF;

  -- Insert room block
  INSERT INTO room_blocks (room_id, start_date, end_date, reason, note)
  VALUES (p_room_id, p_start_date, p_end_date, p_reason, p_note)
  RETURNING id INTO v_block_id;

  RETURN json_build_object(
    'success', true,
    'block_id', v_block_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- RPC function để xóa room block
CREATE OR REPLACE FUNCTION delete_room_block_txn(p_block_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if block exists
  IF NOT EXISTS (SELECT 1 FROM room_blocks WHERE id = p_block_id) THEN
    RAISE EXCEPTION 'Room block not found';
  END IF;

  -- Delete room block
  DELETE FROM room_blocks WHERE id = p_block_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Room block deleted successfully'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
```

---

## ✅ Xác Nhận Kết Quả

Sau khi chạy SQL, hãy chạy lệnh dưới đây để verify functions đã được tạo:

```sql
SELECT routine_name, routine_schema 
FROM information_schema.routines 
WHERE routine_name IN ('create_room_block_txn', 'delete_room_block_txn')
  AND routine_schema = 'public';
```

Kết quả sẽ hiển thị 2 rows:
- `create_room_block_txn` | `public`
- `delete_room_block_txn` | `public`

---

## 🔄 Migration Status

```
Migration ID: 20260512000000
Status: ✅ Applied (marked via `supabase migration repair`)
SQL Code: /supabase/migrations/20260512000000_create_room_block_rpc.sql
Code Changes: Already committed to git
```

---

## 📌 Lưu Ý

- RPC functions này được sử dụng bởi:
  - `src/hooks/useRoomBlocks.ts` → `useCreateBlock()` 
  - `src/hooks/useRoomBlocks.ts` → `useDeleteBlock()`
  
- Cả frontend code đã được cập nhật để gọi RPC functions này
- Sau khi tạo functions, không cần thực hiện thêm bất kỳ hành động nào khác

---

**Created:** 2026-05-12  
**Status:** ✅ Ready for manual execution
