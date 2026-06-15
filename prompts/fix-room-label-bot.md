# Patch: Fix room label trong telegram-webhook

## Vấn đề
`rooms.name` chỉ lưu room type ("Single", "Double"...), không có số phòng.
Cần hiển thị `{id} - {name}` (VD: "102 - Single") thay vì chỉ `{name}`.

## File cần sửa
`supabase/functions/telegram-webhook/index.ts`

## Thay đổi

### Trong handleDayView — phần render freeRooms
Tìm:
```typescript
  if (freeRooms.length > 0) {
      freeRooms.forEach((r) => lines.push(`  • ${r.name ?? r.id}`));
        } else {
        ```

        Thay bằng:
        ```typescript
          if (freeRooms.length > 0) {
              freeRooms.forEach((r) => lines.push(`  • ${r.id} - ${r.name}`));
                } else {
                ```

                ### Trong handleAvailability — phần render freeRooms khoảng ngày
                Tìm:
                ```typescript
                    ...(freeRooms.length > 0 ? freeRooms.map((r) => `  • ${r.name ?? r.id}`) : ["  <i>Hết phòng trong khoảng này</i>"]),
                    ```

                    Thay bằng:
                    ```typescript
                        ...(freeRooms.length > 0 ? freeRooms.map((r) => `  • ${r.id} - ${r.name}`) : ["  <i>Hết phòng trong khoảng này</i>"]),
                        ```

                        ## Sau khi sửa
                        ```bash
                        supabase functions deploy telegram-webhook --no-verify-jwt
                        ```

                        Test: `/today` và `/a 17/06` — phòng trống phải hiển thị dạng "102 - Single"