
## Frontend — Prompt file cho Claude Code

Tôi viết thành 2 file:
1. **`telegram-v31-prompt.md`** — main Edge Function
2. **`task-reminder-fix.md`** — fix 401

---

### FILE: `telegram-v31-prompt.md`

```markdown
# Task: Implement telegram-webhook v31

## Mục tiêu
Rewrite `supabase/functions/telegram-webhook/index.ts` từ v30 lên v31.
Deploy với `--no-verify-jwt`.

## Thay đổi so với v30

### 1. `/today` — thêm staying guests
Hiện tại chỉ show check-in và check-out hôm nay.
Thêm section "Đang ở" — khách có status `checked-in`, check_in < today, check_out > today.

Query mẫu:
```sql
SELECT b.id, b.guest_name, b.room_id, b.check_in, b.check_out
FROM bookings b
JOIN groups g ON b.group_id = g.id
WHERE b.status = 'checked-in'
  AND b.check_in < CURRENT_DATE
  AND b.check_out > CURRENT_DATE
  AND b.is_deleted = false
  AND g.is_deleted = false
ORDER BY b.room_id
```

Format output `/today`:
```
📅 Hôm nay — DD/MM/YYYY

🛎 Check-in (N):
• Phòng 101 — Nguyễn Văn A (2đ)

🏁 Check-out (N):
• Phòng 202 — John Smith

🏠 Đang ở (N):
• Phòng 103 — Trần Thị B (→ 18/06)
• Phòng 201 — Yamada Taro (→ 19/06)

_(không có)_ nếu list rỗng
```

### 2. `/next` — chỉ ngày mai (không còn 3 ngày)
Hiện tại show 3 ngày tiếp theo. Thay thành chỉ show ngày mai (tomorrow = today + 1 day).

Format output `/next`:
```
📅 Ngày mai — DD/MM/YYYY

🛎 Check-in (N):
• Phòng 101 — Nguyễn Văn A (2đ, Walk-in)

🏁 Check-out (N):
• Phòng 202 — John Smith (Booking.com)
```
Thêm source vào mỗi booking (Walk-in / Booking.com / v.v.).

### 3. `/a [dd/mm]` hoặc `/a [dd/mm] [dd/mm]` — Availability Checker
Redesign hoàn toàn. Trước đây show phòng trống hiện tại.

Mới:
- `/a` (không tham số) → show phòng trống HÔM NAY (check_in = today)
- `/a 20/06` → show phòng trống cho ngày 20/06 (single night)
- `/a 20/06 22/06` → show phòng trống cho khoảng 20/06 → 22/06

Logic: phòng "trống" = không có booking nào có status != 'cancelled' overlap với khoảng ngày đó.

Dùng RPC `check_room_availability(p_room_id, p_check_in, p_check_out, null)` cho từng phòng.
8 phòng: ['101','102','103','201','202','203','301','302'].

Parse ngày: dd/mm → năm hiện tại. Nếu tháng < tháng hiện tại → năm sau.

Format output:
```
🔍 Phòng trống 20/06 → 22/06 (2 đêm)

✅ Trống (5):
101 · 102 · 201 · 203 · 302

❌ Đã đặt (3):
103 · 202 · 301
```

Nếu check single day: show "1 đêm".

### 4. `/task` — tạo Notion task với urgency
Syntax: `/task -N [nội dung] | [ghi chú]` (giữ nguyên v30)
Thêm: urgency flag `-N` parse thành priority Notion:
- `-1` = 🔴 Khẩn
- `-2` = 🟡 Cao  
- `-3` = 🟢 Thường
- Không có flag → Thường

**Không thay đổi gì khác trong `/task` logic** — chỉ đảm bảo urgency đang hoạt động đúng.

## Các lệnh GIỮ NGUYÊN (không sửa)
`/rooms`, `/clean`, `/cleaned`, `/checkin`, `/checkout`, `/stay`, `/issue`,
`/revenue`, `/debt`, `/tasks`, `/done`, `/skip`, `/extend`, `/help`

## Technical notes
- ALLOWED_CHAT_ID = Deno.env.get('ALLOWED_CHAT_ID') — bắt buộc check đầu mỗi handler
- Supabase client: tạo bằng service_role key từ env
- `bookings.status` (không phải `booking_status`)
- `check_room_availability` trả về array → đọc `[0].available`
- `groups.is_deleted = false` filter bắt buộc khi join groups
- Tất cả date dùng timezone Asia/Ho_Chi_Minh: `new Date().toLocaleDateString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})`
- Dùng `dayjs` nếu cần parse/format date phức tạp — đã available

## Deploy
```bash
supabase functions deploy telegram-webhook --no-verify-jwt
```

## File path
`supabase/functions/telegram-webhook/index.ts`

## Checklist sau deploy
- [ ] Test `/today` — có section "Đang ở"
- [ ] Test `/next` — chỉ ngày mai
- [ ] Test `/a 20/06` — list phòng trống
- [ ] Test `/a 20/06 22/06` — range
- [ ] Test `/task -1 Sửa máy lạnh phòng 101` — urgency khẩn
```

---

### FILE: `task-reminder-fix.md`

```markdown
# Task: Fix task-reminder Edge Function (401 error)

## Vấn đề
`task-reminder` Edge Function bị lỗi 401 khi được gọi bởi pg_cron.
Nguyên nhân: deploy thiếu flag `--no-verify-jwt`.

## Fix
Chỉ cần redeploy với flag đúng — KHÔNG sửa code:

```bash
supabase functions deploy task-reminder --no-verify-jwt
```

## Verify
Sau deploy, chạy lệnh sau để trigger test thủ công:
```bash
curl -X POST https://rcfhhgywjdwqcgnpkbtl.supabase.co/functions/v1/task-reminder \
  -H "Content-Type: application/json"
```
Kỳ vọng: bot gửi message vào group, không có lỗi 401 trong logs.

## Nếu vẫn lỗi
Kiểm tra pg_cron job còn active:
```sql
SELECT jobid, schedule, command, active FROM cron.job WHERE jobname ILIKE '%task-reminder%';
```
```

---

## Tóm tắt cho Claude Code

Hiếu chạy theo thứ tự:

**Bước 1** — Verify tables tồn tại:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('room_issues','telegram_task_sessions');
```

**Bước 2** — Feed `telegram-v31-prompt.md` vào Claude Code để implement Edge Function.

**Bước 3** — Deploy:
```bash
supabase functions deploy telegram-webhook --no-verify-jwt
```

**Bước 4** — Fix task-reminder:
```bash
supabase functions deploy task-reminder --no-verify-jwt
```

**Bước 5** — Test `/today`, `/next`, `/a 20/06`, `/a 20/06 22/06`.

---