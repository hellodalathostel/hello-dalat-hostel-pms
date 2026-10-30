# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hello Dalat Hostel PMS — property management system for an 8-room hostel in Da Lat, Vietnam.

- Operators: Owner (Nguyễn Thanh Hiếu) + Staff (Lợi / Housekeeping)
- Deployment: Vercel auto-deploy from `main`
- Database: Supabase project `rcfhhgywjdwqcgnpkbtl` (PostgreSQL 17, ap-southeast-1)
- URL: https://hello-dalat-hostel-pms.vercel.app
- Landing page (hellodalathostel.com) là repo riêng — không đụng vào đây.

## Tech Stack

```
Frontend:  React 18 + TypeScript + Vite
UI:        Ant Design 5
State:     Zustand (auth) + TanStack Query v5 (server state)
Forms:     React Hook Form + Zod validation
Dates:     dayjs (NOT moment.js)
Routing:   React Router v6
Backend:   Supabase (Auth + RLS + Storage + Edge Functions/Deno + Realtime)
Testing:   Vitest + React Testing Library + MSW
```

## Development Commands

```bash
npm run dev       # Start dev server (Vite)
npm run build     # Build for production (TypeScript check + Vite build)
npm run lint      # ESLint (known errors in router.tsx, CheckoutModal)
npm run preview   # Preview production build locally
```

Trước khi báo xong task: `npm run build` phải sạch. Lệnh khác lấy từ `package.json`, không đoán.

## Working Principles

**Surgical changes**
- Chỉ sửa phần liên quan trực tiếp đến yêu cầu. Không tiện tay refactor, đổi format, xoá comment ngoài scope.
- Thấy dead code / pattern cũ không liên quan → **nêu ra**, không tự xoá.
- Khớp style sẵn có của file.
- Chỉ xoá import/biến/hàm thừa **do chính thay đổi của bạn gây ra**.

**Simplicity first**
- Code tối thiểu đủ đúng yêu cầu. Không thêm feature/abstraction/error-handling cho case không thể xảy ra ở hệ thống 8 phòng, 1 nhân viên.
- Có cách đơn giản hơn mà vẫn đúng → nói trước khi build cách phức tạp.

**Output**: code đầy đủ, không placeholder. Giải pháp $0 trước; cần dịch vụ trả phí → nêu rõ lý do. Không chắc → hỏi đúng 1 câu.

## Verify, don't trust docs

Doc và ghi chép (kể cả file này) có thể tụt hậu so với thực tế đã deploy. Trước khi sửa:

- **Edge Function**: `list_edge_functions`, rồi **đọc source** trước khi kết luận nó làm gì hoặc có auth hay không. Không dựa vào cờ `verify_jwt`, `cron.job`, hay tên function.
- **RPC**: tra signature thật, không suy từ tên biến hay code cũ (RPC có default cho mọi param sẽ "chạy thành công" dù gọi sai tên param và ghi log sai âm thầm):
  ```sql
  SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname = '<rpc_name>';
  ```
- **Schema**: query `information_schema.columns` cho bảng cần dùng, không đoán cột/enum.
- Không hardcode số lượng function/RPC/cron vào doc hay code.

## Core Architecture Principles

### 1. Database is Source of Truth

Computed fields do trigger quản lý — **không bao giờ tính ở frontend**:

- `bookings.grand_total` — trigger
- `bookings.room_subtotal` — trigger (price_per_night × nights)
- `bookings.nights` — `GENERATED ALWAYS AS (check_out - check_in) STORED` (không INSERT)
- `groups.net_revenue` — trigger
- `groups.grand_total` — trigger-synced; balance cấp group = `groups.grand_total − groups.paid`

Frontend chỉ đọc từ DB. `bookings` **không** có cột balance/paid; tiền thu nằm ở `groups.paid`.

### 2. All Mutations Via RPC — No Direct INSERT/UPDATE/DELETE

```ts
// ✅ Correct
const { data } = await supabase.rpc('create_group_booking_txn', { ... })

// ❌ Wrong — bypasses business logic
await supabase.from('bookings').insert({ ... })
```

Mọi mutation lên `bookings`, `payment_history`, `booking_guests` phải đi qua RPC để giữ integrity và kích hoạt trigger. Huỷ OTA block thủ công qua `cancel_ota_block(p_block_id)`, không UPDATE trực tiếp.

### 3. Mandatory Import Paths

```ts
// ✅ Always use these
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'
import { normalizeError } from '@/shared/utils/normalizeError'

// ❌ Never use these
import { supabase } from '@/lib/supabase'   // wrong path
import { message } from 'antd'              // use useAppFeedback
```

- `@/api/supabase`: nguồn duy nhất của Supabase client
- `useAppFeedback`: bọc static API của Ant Design bằng React context (cần cho `App` component)
- `useBreakpoint`: nguồn duy nhất cho responsive breakpoint
- `normalizeError`: parse message từ PostgreSQL `RAISE EXCEPTION`, map sang tiếng Việt thân thiện

### 4. Error Handling Pattern

```ts
import { normalizeError } from '@/shared/utils/normalizeError'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

const { message } = useAppFeedback()

try {
  const { data, error } = await supabase.rpc('some_function', { ... })
  if (error) throw error
  return data
} catch (err) {
  const normalized = normalizeError(err)
  message.error(normalized.message)
  throw normalized
}
```

### 5. Booking Status Enum — Hyphens

```ts
type BookingStatus = 'booked' | 'checked-in' | 'checked-out' | 'cancelled'
// ✅ 'checked-in'   ❌ 'checked_in' / 'checkedin'
```

### 6. Soft Deletes — luôn filter

- `bookings`: `.or('is_deleted.is.null,is_deleted.eq.false')`
- `groups`: `is_deleted = false`
- `ota_calendar_feed`: `is_cancelled = false` (mọi query join bảng này)

## Domain Rules (đã từng gây bug thật)

**Nhãn phòng**: luôn hiển thị / group / sort / DISTINCT theo `rooms.id` (số phòng, text). `rooms.name` là loại phòng và **trùng nhau** giữa nhiều phòng, chỉ dùng làm phụ đề.

**Occupancy**: một query gộp. Không tách staying/arrivals (walk-in nhận phòng thẳng sẽ lọt khe):

```sql
WHERE check_in  <= :date
  AND check_out >  :date
  AND status IN ('booked','checked-in')
  AND is_deleted = false
```

Đếm `COUNT(DISTINCT room_id)` ÷ `rooms WHERE is_active = true`. Không đếm số booking (same-day turnover rất phổ biến).

**Ngày/giờ**: SQL — DB timezone đã là `Asia/Ho_Chi_Minh`, `CURRENT_DATE` là ICT. Deno/Edge Function — `new Date().toISOString()` là UTC (sai ngày 00:00–07:00 ICT), dùng `toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })`.

**iCal**:
- Booking có `external_ical_uid IS NOT NULL` → dùng đúng UID đó trong VEVENT (chống loop; Booking.com dedup theo UID).
- `is_sticky = true` → không overwrite khi re-import.
- `booking_source` enum dùng `'Booking.com'` (label có dấu chấm), không phải slug.

**`brain.daily_log` từ automation**: **CẤM** dùng `upsert_brain_daily_log` trong Edge Function/cron (nó xoá sạch mọi dòng cùng `category` trong ngày). Dùng:

```sql
SELECT public.log_automation_run(p_log_date := <date>, p_source := '<function-slug>', p_content := '<kết quả>');
```

`brain` schema không được PostgREST expose: đọc-ghi `brain.*` từ Edge Function/client phải qua RPC `SECURITY DEFINER` đặt ở schema `public`.

## RPC Functions

Đây là danh sách các RPC chính, **không phải đầy đủ**. Danh sách thật: `SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public'`.

| Function | Purpose |
|---|---|
| `create_group_booking_txn` | Tạo booking (group + bookings + services + discounts); nhận `price_per_night` |
| `update_booking_txn` | Update booking (`p_cancel: true` để huỷ) |
| `checkin_booking_txn` | Check-in (upsert customers + link guests + update status) |
| `checkout_single_booking_txn` | Checkout 1 booking (group còn booking active khác) |
| `checkout_last_booking_and_settle_txn` | Checkout booking cuối của group + settle group |
| `record_payment_txn` | Ghi thanh toán (tự thêm 4% surcharge nếu `method='card'`) |
| `void_checkedout_booking_txn` | Soft-delete booking đã checkout (owner only) |
| `void_payment_txn` | Void một payment |
| `add_early_late_txn` | Early check-in / late checkout |
| `add_discount_txn` | Thêm discount |
| `delete_booking_service_txn` / `delete_booking_discount_txn` | Xoá service / discount |
| `confirm_booking_request_txn` | Xác nhận booking request |
| `create_room_block_txn` / `delete_room_block_txn` | Quản lý room block |
| `log_room_issue_txn` | Ghi sự cố phòng |
| `cancel_ota_block` | Huỷ OTA block thủ công |
| `check_room_availability` | Kiểm tra phòng trống theo khoảng ngày |
| `get_suggested_price` | Gợi ý giá theo pricing rules |
| `current_user_role` | Role của user hiện tại |
| `create_document_log` | Log việc tạo tài liệu |

**Legacy — KHÔNG DÙNG**: `create_booking`, `check_booking_conflict`, `checkout_booking`, `process_checkout`, `checkout_booking_txn` và `checkout_group_txn` (hai hàm này đã bị revoke EXECUTE, thay bằng `checkout_single_booking_txn` / `checkout_last_booking_and_settle_txn`, xem `useCheckOut.ts` v3).

## Key Database Tables

**bookings**: `price_per_night` là input giá phòng DUY NHẤT (trước đây là `price`) · `room_subtotal`, `grand_total` trigger-computed · `nights` generated · `status` · `is_deleted` · `surcharge` = card fee · `external_ical_uid`, `ota_booking_number`, `is_sticky` cho iCal.

**rooms**: `housekeeping_status` ∈ `'clean' | 'dirty' | 'cleaning' | 'out_of_order'`; tự chuyển `'dirty'` khi checkout (trigger `trg_room_dirty_on_checkout`). `ical_export_token` là secret, không log ra.

**groups**: `net_revenue`, `grand_total` trigger-computed · `paid` = tổng thanh toán · gom nhiều booking của cùng một khách/đặt chỗ.

## TanStack Query v5 Patterns

**Query keys** thường dùng: `['dashboard','today']`, `['room-calendar']`, `['booking-detail', groupId]`, `['bookings']`, `['groups']`.

**Mutation** — try/catch tường minh trong `mutationFn` (bắt cả lỗi network/parsing, không chỉ `error` của Supabase), invalidate query liên quan:

```ts
const mutation = useMutation({
  mutationFn: async (payload) => {
    try {
      const { data, error } = await supabase.rpc('some_function', payload)
      if (error) throw error
      return data
    } catch (err) {
      throw err instanceof Error ? err : new Error('Lỗi không xác định khi ...')
    }
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
    message.success('Thành công')
  },
  onError: (err) => {
    message.error(normalizeError(err).message)
  },
})
```

**Cache theo domain** (không để default):
- List/search (bookings, guests): `staleTime: 30_000`, `gcTime: 5 * 60_000`
- Dashboard real-time: `staleTime: 0` (comment lý do) + `refetchInterval`
- Dữ liệu ít đổi: `staleTime: 60_000`, `gcTime: 10 * 60_000`

**Một nguồn cho list query dùng chung**: nếu ≥2 component fetch cùng bảng (vd `rooms`), dùng 1 hook canonical (`useRooms()`), không tạo query riêng theo field-subset.

**File lớn (>~500 dòng)**: tách theo concern, giữ file gốc làm **barrel re-export** với named export y nguyên. Không tự sửa import ở nơi gọi; diff danh sách `export` trước/sau để chắc đủ.

## UI Patterns

```tsx
const { isMobile, isTablet, isDesktop } = useBreakpoint()

// Dùng Flex thay Space cho header row
<Flex justify="space-between" align="center">
  <Title level={4}>...</Title>
  <Button>...</Button>
</Flex>
```

```ts
dayjs(date).format('DD/MM/YYYY')   // hiển thị
dayjs(date).format('YYYY-MM-DD')   // gửi DB

new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
```

## Migration Rules (từ 2026-05-30)

Mọi bảng mới ở schema `public` hoặc `brain` phải có ở cuối migration: `ENABLE ROW LEVEL SECURITY` + `GRANT` tường minh. Với bảng **nội bộ**, thêm `REVOKE ALL ... FROM anon` (RLS bật chưa đủ: chỉ cần ai đó lỡ tạo policy `FOR ALL` mà quên `TO authenticated` là anon có quyền ngay).

```sql
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.new_table TO authenticated;
GRANT ALL ON public.new_table TO service_role;
REVOKE ALL ON public.new_table FROM anon;
-- Chỉ bảng cần public mới cấp cho anon, đúng phần cần thiết:
--   rooms → GRANT SELECT ... TO anon
--   booking_requests → GRANT INSERT ... TO anon
```

Migration chạy **trước** khi deploy code phụ thuộc nó. Migration breaking hoặc không revert được → ghi rõ trong mô tả.

## Edge Functions

- Không tạo Edge Function mới khi chưa kiểm tra `list_edge_functions` (số lượng function đã nhiều hơn nhiều so với lúc đầu dự án).
- Cron gọi function bằng URL + service_role JWT hardcode trong command; `current_setting('app.supabase_url')` chưa config, dùng sẽ gãy im lặng. Verify kết quả bằng `net._http_response`, không dùng `cron.job_run_details` (báo success cả khi function trả 401/500).
- `verify_jwt: false` **không** đồng nghĩa endpoint hở: nhiều function có auth riêng trong code (Bearer + `auth.getUser()`, hoặc header `x-api-key`). Thêm endpoint public mới → **flag rõ** cho Hiếu.
- **Unicode**: deploy qua Supabase MCP làm hỏng chuỗi tiếng Việt. Dùng escape `\uXXXX` hoặc đọc từ `Deno.env.get()` (vd tên property Notion).
- Notion Task DB: property tiếng Việt; `Trạng Thái` là **select** (patch `{select:{name}}`, không phải `{status:{...}}`).
- Thêm phòng mới → sửa `ROOM_NOTION_MAP` trong `ops-task-creator` và redeploy.
- `ocr-id-scanner` tồn tại nhưng **không** được gọi từ UI. `brain-embed` là function thụ động (chỉ chạy khi có HTTP POST/cron).

## Important Views

```ts
supabase.from('dashboard_today').select('*')           // tất cả phòng + booking/block hiện tại
supabase.from('room_calendar').select('*')             // booking + block gộp
supabase.from('dk14_luu_tru').select('*')              // báo cáo DK14 (19 cột)
supabase.from('finance_monthly_revenue').select('*')   // doanh thu — dùng view này, KHÔNG dùng monthly_revenue
```

## Folder Structure

```
src/
  api/
    supabase.ts              # ← nguồn DUY NHẤT của Supabase client
  features/
    bookings/
      hooks/                 # useCheckIn, useCheckout, useRecordPayment, useVoidBooking
      components/            # BookingDetailDrawer, CheckInModal, CheckoutModal
    rooms/
    documents/
      documentTemplates.ts
    finance/
    housekeeping/
    ota-calendar/
    telegram/
  shared/
    hooks/
      useBreakpoint.ts       # ← nguồn DUY NHẤT cho breakpoint
      useAppFeedback.ts      # ← nguồn DUY NHẤT cho toast/notification
      useCurrentUserRole.ts
    utils/
      normalizeError.ts      # ← parse PostgreSQL RAISE EXCEPTION
    components/
      BottomNav.tsx
```

## Business Rules (đã quyết)

- Không có trang Register công khai — chỉ Owner tạo tài khoản Staff.
- Sau checkout → phòng tự chuyển "dirty" (trigger).
- CCCD không bắt buộc khi tạo booking, **BẮT BUỘC** khi check-in.
- Checkout còn nợ: CHO PHÉP, kèm checkbox xác nhận (`p_confirm_debt: true`).
- Thanh toán thẻ: tự cộng 4% khi `method = 'card'`, phải truyền `p_first_booking_id`.
- Giờ mặc định: check-in 14:00, check-out 12:00.
- Không bypass RLS — không có `service_role` key trong frontend.
- `bot_leads` không có UI — chỉ Telegram bot quản lý.

## Known Issues (không sửa khi chưa được duyệt)

- Lint errors ở `router.tsx` và `CheckoutModal` — đã biết, không chặn.
- `app_users.firebase_uid` là legacy — chờ gỡ.
- iCal `DTSTAMP` dùng hậu tố `ZZ` thay vì `Z` — chờ xác nhận.

## Workflow

Repo theo quy trình nhiều AI:

- **Claude.ai (Lead Developer)** → architecture, schema, code review
- **Claude Code (bạn)** → implement theo spec
- **Hiếu (Product Owner)** → review cuối và duyệt merge

**Không tự quyết kiến trúc hay schema.** Thay đổi database cần Claude.ai duyệt trước.

Thứ tự khi task có nhiều phần: Migration SQL (nếu có) → Types/Zod → Hook/query → Component. Xong chunk nào báo để review rồi mới sang chunk sau (task đơn giản 1 file, không migration thì làm một lần).

Tự check trước khi báo xong:
- [ ] Đúng spec, không thêm ngoài scope
- [ ] Edge case: null, rỗng, concurrent
- [ ] RLS không bị bypass; bảng mới đủ ENABLE RLS + GRANT (+ REVOKE anon nếu nội bộ)
- [ ] Không `any`; không query N+1
- [ ] Không breaking change với data hiện có
- [ ] `npm run build` sạch

Báo cáo ngắn: file đã đổi, migration cần chạy (và thứ tự), env/secret cần set, rủi ro còn lại.

> Tiến độ phase và backlog **không** ghi ở đây (thay đổi liên tục). Xem `brain.daily_log` (category `dev`) và `brain.decisions`.

## What NOT to Do

- ❌ Đổi database schema khi chưa có Claude.ai duyệt
- ❌ INSERT/UPDATE/DELETE trực tiếp lên `bookings`, `payment_history`, `booking_guests`
- ❌ Tạo Edge Function mới khi chưa kiểm tra danh sách function hiện có
- ❌ Dùng `any` trong TypeScript
- ❌ Hardcode Supabase URL/key (dùng `import.meta.env`)
- ❌ Dùng `service_role` key trong frontend
- ❌ Dùng RPC legacy: `checkout_booking`, `process_checkout`, `checkout_booking_txn`, `checkout_group_txn`
- ❌ Dùng field `price` của bookings (phải là `price_per_night`)
- ❌ Tính `room_subtotal` / `grand_total` ở frontend
- ❌ `import { message } from 'antd'` (dùng `useAppFeedback`)
- ❌ Dùng `upsert_brain_daily_log` trong function tự động
- ❌ Commit secret, token, `.env`
- ❌ Xoá dữ liệu production hoặc chạy migration phá huỷ khi chưa có Hiếu xác nhận
