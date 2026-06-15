# Patch: /task command — thêm Ghi Chú và Ưu Tiên

## Mục tiêu
Cập nhật lệnh `/task` trong Edge Function `telegram-webhook` để hỗ trợ:
- **Nội dung chi tiết** (Ghi Chú) — field text trong Notion
- **Mức độ ưu tiên** (Ưu Tiên) — select field trong Notion

## Format lệnh mới
```
/task Tên task | Nội dung chi tiết | mức ưu tiên
```
- Phần 1: tên task (bắt buộc)
- Phần 2: ghi chú / chi tiết (tùy chọn)
- Phần 3: ưu tiên (tùy chọn, default = Bình Thường)

Ví dụ:
```
/task Dọn phòng 101 | Thay khăn tắm, kiểm tra minibar | cao
/task Mua nước suối
/task Sửa điều hòa 202 | Điều hòa không lạnh từ sáng | khan
```

## Notion schema (đã xác nhận)
- DB ID: `2b3cd2c9-6b3a-4f39-963e-de01d5ff28dc`
- `Tên Task`: title
- `Ghi Chú`: rich_text
- `Ưu Tiên`: select — options: `Khẩn` | `Cao` | `Bình Thường` | `Thấp`
- `Trạng Thái`: select — default `Cần Làm`
- `Người Thực Hiện`: select — default `Lợi`

## Các thay đổi cần thực hiện

### Bước 1: Thêm hàm mapPriority

Thêm hàm này vào file Edge Function `telegram-webhook`, đặt gần các helper function khác:

```typescript
// Map input người dùng → giá trị Ưu Tiên trong Notion (case-insensitive, chấp nhận viết tắt và không dấu)
function mapPriority(input: string): string {
  const s = input.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // bỏ dấu tiếng Việt
  if (['khan', 'k'].includes(s)) return 'Khẩn'
  if (['cao', 'c'].includes(s)) return 'Cao'
  if (['thap', 't'].includes(s)) return 'Thấp'
  return 'Bình Thường' // mặc định cho bt, binh, b, hoặc bất kỳ input khác
}
```

### Bước 2: Thay thế logic xử lý lệnh /task

Tìm đoạn code xử lý lệnh `/task` (nơi parse `text` và gọi Notion API để tạo task).

Thay thế toàn bộ phần parse + build Notion properties bằng:

```typescript
// Parse input: split theo | thành tối đa 3 phần
const parts = text.split('|').map((p: string) => p.trim())
const taskName = parts[0]
const ghiChu = parts[1] ?? ''
const uuTien = parts[2] ? mapPriority(parts[2]) : 'Bình Thường'

// Validate tên task
if (!taskName) {
  await sendTelegram(chatId, '❌ Vui lòng nhập tên task.\n\nVí dụ:\n/task Dọn phòng 101 | Thay khăn tắm | cao')
  return
}

// Build Notion properties
const notionProperties: Record<string, unknown> = {
  'Tên Task': { title: [{ text: { content: taskName } }] },
  'Trạng Thái': { select: { name: 'Cần Làm' } },
  'Người Thực Hiện': { select: { name: 'Lợi' } },
  'Ưu Tiên': { select: { name: uuTien } },
}

// Chỉ thêm Ghi Chú nếu có nội dung
if (ghiChu) {
  notionProperties['Ghi Chú'] = { rich_text: [{ text: { content: ghiChu } }] }
}

// Notion API call (giữ nguyên cách gọi hiện tại, chỉ thay properties)
const notionBody = {
  parent: { database_id: NOTION_TASK_DB_ID },
  properties: notionProperties,
}
```

### Bước 3: Cập nhật reply confirm sau khi tạo task thành công

Tìm đoạn `sendTelegram` confirm tạo task thành công, thay bằng:

```typescript
// Map emoji theo mức ưu tiên
const priorityEmoji: Record<string, string> = {
  'Khẩn': '🔴',
  'Cao': '🟠',
  'Bình Thường': '🔵',
  'Thấp': '⚪',
}
const emoji = priorityEmoji[uuTien] ?? '🔵'

await sendTelegram(
  chatId,
  `✅ Đã tạo task!\n📌 ${taskName}${ghiChu ? `\n📝 ${ghiChu}` : ''}\n${emoji} Ưu tiên: ${uuTien}`
)
```

### Bước 4: Cập nhật /help

Tìm đoạn mô tả lệnh `/task` trong handler `/help`, cập nhật thành:

```
/task <tên> [| <ghi chú>] [| <ưu tiên>]
  Tạo task mới cho Lợi
  Ưu tiên: khan | cao | bt | thap (mặc định: bt)
  VD: /task Dọn 101 | Thay khăn | cao
```

## Sau khi sửa xong

1. Chạy `npm run build` (hoặc kiểm tra TypeScript errors nếu dùng Deno)
2. Deploy Edge Function:
   ```
   supabase functions deploy telegram-webhook
   ```
3. Test lệnh:
   ```
   /task Test đủ 3 phần | Đây là ghi chú chi tiết | cao
   /task Test chỉ tên
   /task Test 2 phần | Có ghi chú nhưng không có ưu tiên
   ```
4. Verify trên Notion DB rằng `Ghi Chú` và `Ưu Tiên` được điền đúng