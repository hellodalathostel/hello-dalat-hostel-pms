# Fix: Thêm số phòng vào telegram-webhook

## Vấn đề
`/today` và `/next` hiển thị tên loại phòng (Single, Deluxe Double...) 
nhưng thiếu số phòng (102, 103...).

## Thay đổi cần làm

Trong file `supabase/functions/telegram-webhook/index.ts`, 
thêm helper function `roomLabel` và cập nhật tất cả chỗ format tên phòng.

### 1. Thêm interface + helper (sau các const ICON, trước getDayReport)

```typescript
interface BookingRow { room_id: string; guest_name: string; guests_count?: number; status: string; check_in: string; check_out: string; }
interface RoomRow { id: string; name: string | null; }

// Format tên phòng: "102 - Single"
function roomLabel(r: RoomRow): string {
  return r.name ? `${r.id} - ${r.name}` : r.id;
  }
  ```

  ### 2. Trong getDayReport — thay tất cả chỗ format tên phòng

  **Cũ** (3 chỗ dùng `r.name ?? r.id` hoặc `rooms.find(...).name`):
  ```typescript
  const rn = rooms.find((r) => r.id === b.room_id)?.name ?? b.room_id;
  ```

  **Mới:**
  ```typescript
  const room = rooms.find((r) => r.id === b.room_id);
  const rn = room ? roomLabel(room) : b.room_id;
  ```

  Và trong phần check-out (single line):
  ```typescript
  // Cũ:
  lines.push(`  • ${rooms.find((r) => r.id === b.room_id)?.name ?? b.room_id} — ${b.guest_name}`);
  // Mới:
  const room = rooms.find((r) => r.id === b.room_id);
  lines.push(`  • ${room ? roomLabel(room) : b.room_id} — ${b.guest_name}`);
  ```

  Và phần Trống + OTA block:
  ```typescript
  // Cũ:
  freeRooms.map((r) => r.name ?? r.id).join(", ")
  otaOnlyRooms.map((r) => r.name ?? r.id).join(", ")
  // Mới:
  freeRooms.map(roomLabel).join(", ")
  otaOnlyRooms.map(roomLabel).join(", ")
  ```

  ### 3. Trong handleA — cùng pattern

  ```typescript
  // Cũ:
  free.map((r: RoomRow) => `  • ${r.name ?? r.id}`)
  // Mới:
  free.map((r: RoomRow) => `  • ${roomLabel(r)}`)
  ```

  ### 4. Đổi order("name") thành order("id") trong getDayReport và handleA

  Để phòng sort theo số (101, 102... thay vì alphabet tên loại).

  ```typescript
  // Cũ:
  supabase.from("rooms").select("id, name").order("name")
  // Mới:
  supabase.from("rooms").select("id, name").order("id")
  ```

  ## Deploy

  ```bash
  cd D:\hello-dalat-hostel-pms
  supabase functions deploy telegram-webhook
  ```

  ## Kết quả mong đợi

  ```
  🏨 Tình hình phòng — Th 2, 15/06

  📥 Check-in (3)
    • 102 - Single — Huỳnh công danh · 1 khách
      • 103 - Deluxe Double — Eloise Smith · 2 khách
        • 301 - Standard Double — courteney steffens · 2 khách

        ✅ Trống (5)
          201 - Deluxe Queen, 202 - Family, 203 - Single, 302 - Standard Double, 303 - ...
          ```