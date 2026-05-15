# AGENTS.MD — Hello Dalat PMS

> Đọc file này trước khi bắt đầu bất kỳ task nào.
> Cập nhật lần cuối: 2026-05-15

---

## AI Workflow

| Role | Tool | Nhiệm vụ |
|---|---|---|
| Lead Developer | Claude (claude.ai) | Architecture, schema, code review, quyết định kỹ thuật |
| Code Writer | GitHub Copilot Agent (VSCode) | Implement theo chỉ dẫn Claude — không tự plan |
| Product Owner | Hiếu | Quyết định cuối cùng |

**Quy tắc quan trọng:**
- Copilot Agent **không tự quyết định architecture** — chỉ implement theo output Claude đã soạn sẵn
- Khi nhận instruction từ Claude → apply trực tiếp, không rewrite hay "cải tiến" tự phát
- Nếu không chắc → dừng lại, không đoán

---

## Project Info

| | |
|---|---|
| **App** | Hello Dalat PMS — hostel management system |
| **URL** | https://hello-dalat-hostel-pms.vercel.app |
| **Supabase project** | `rcfhhgywjdwqcgnpkbtl` |
| **Deploy** | Vercel (auto-deploy từ `main` branch) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | Ant Design 5 |
| State | Zustand |
| Server state | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Date | dayjs |
| Routing | React Router v6 |
| Backend | Supabase (Postgres 17, Auth + RLS, Storage, Edge Functions/Deno, Realtime) |
| Testing | Vitest + React Testing Library + MSW |

---

## Database Schema — `public`

### Tables
```
app_users · booking_discounts · booking_guests · booking_services
bookings · bot_leads · customers · dashboard_today · dk14_luu_tru
document_logs · expenses · groups · monthly_revenue · ota_calendar_feed
payment_history · pricing_rules · revenue_manual_log · room_blocks
room_calendar · rooms · services · tours
```

### Enums
```
booking_status   : booked | checked-in | checked-out | cancelled
booking_source   : Booking.com | Facebook | Gọi điện/Zalo | Khách quen | Walk-in | Other
payment_method   : cash | transfer | card | other | momo | zalopay
block_reason     : maintenance | owner_use | ota_closed | deep_cleaning | other
pricing_rule_type: weekend | peak_season | holiday | custom
document_type    : CCCD | Hộ chiếu | Giấy tờ khác
doc_kind         : booking_confirmation | deposit_request | deposit_confirmation | invoice | arrival_notice
doc_format       : pdf | zalo_text | email_html
expense_category : Lương nhân viên | Điện nước | Vệ sinh | Sửa chữa | Marketing | Khác | Thuế & Phí
residency_type   : Thường trú | Tạm trú | Địa chỉ khác
bot_lead_status  : pending | closed | converted
user_role        : owner | staff
```

### RPC Functions (dùng thay cho direct table mutation khi có)
```
calc_booking_grand_total    check_room_availability      checkin_booking_txn
checkout_booking_txn        checkout_group_txn           create_group_booking_txn
process_check_in_txn        process_check_out_txn        record_payment_txn
update_booking_txn          get_suggested_price          sync_group_net_revenue
create_document_log         refresh_booking_grand_total  current_user_role
```

> **Quy tắc:** Ưu tiên gọi RPC function thay vì mutate trực tiếp vào bảng `bookings`, `payment_history`, `booking_guests`.

---

## Edge Functions (Deno — Supabase)

```
checkin-processor   ocr-id-scanner    checkin-reminder
daily-revenue       daily-revenue-summary
tax-reminder        dk13-reminder     ical-feed
```

> Kiểm tra danh sách trên trước khi tạo Edge Function mới để tránh duplicate.

---

## Migration Rule (từ 30/05/2026)

Mọi table mới trong schema `public` hoặc `brain` **bắt buộc** thêm vào cuối migration SQL:

```sql
-- Thay [table_name] bằng tên bảng thực tế
GRANT SELECT, INSERT, UPDATE, DELETE ON public.[table_name] TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.[table_name] TO authenticated;
GRANT ALL ON public.[table_name] TO service_role;
ALTER TABLE public.[table_name] ENABLE ROW LEVEL SECURITY;
```

---

## Coding Conventions

### Naming
- **Components:** PascalCase — `BookingCard.tsx`, `RoomCalendar.tsx`
- **Hooks:** camelCase với prefix `use` — `useBookings.ts`, `useRoomAvailability.ts`
- **Utils:** camelCase — `formatCurrency.ts`, `parseDate.ts`
- **Files:** kebab-case cho non-component — `supabase-client.ts`
- **DB columns:** snake_case (theo Supabase convention)

### TanStack Query pattern
```typescript
// Query key factory — luôn dùng, không hardcode string
export const bookingKeys = {
  all: ['bookings'] as const,
  list: (filters?: BookingFilters) => [...bookingKeys.all, 'list', filters] as const,
  detail: (id: string) => [...bookingKeys.all, 'detail', id] as const,
}

// Query
const { data } = useQuery({
  queryKey: bookingKeys.list(filters),
  queryFn: () => fetchBookings(filters),
})

// Mutation — luôn invalidate sau khi mutate
const mutation = useMutation({
  mutationFn: updateBooking,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
})
```

### Zod + React Hook Form
```typescript
const schema = z.object({
  room_id: z.string().uuid(),
  check_in: z.string(),   // ISO date string
  check_out: z.string(),
  total_price: z.number().positive(),
})

const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema),
})
```

### Supabase client
```typescript
// Luôn import từ lib/supabase, không khởi tạo mới
import { supabase } from '@/lib/supabase'
```

### Date — luôn dùng dayjs
```typescript
import dayjs from 'dayjs'
dayjs(date).format('DD/MM/YYYY')
dayjs(date).toISOString()
```

### Currency
```typescript
// Format VND
const formatVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
```

---

## RLS Pattern

Mọi bảng mới cần có ít nhất 2 policies:

```sql
-- Owner: full access
CREATE POLICY "owner_all" ON public.[table_name]
FOR ALL TO authenticated
USING (current_user_role() = 'owner')
WITH CHECK (current_user_role() = 'owner');

-- Staff: read + insert (điều chỉnh theo nghiệp vụ)
CREATE POLICY "staff_read" ON public.[table_name]
FOR SELECT TO authenticated
USING (current_user_role() IN ('owner', 'staff'));
```

---

## Testing

```bash
# Chạy trước khi suggest "task complete"
npm run test          # Vitest unit tests
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint
```

> Nếu test fail hoặc có TypeScript error → tự fix trong vòng lặp trước khi báo done.

---

## Những điều KHÔNG làm

- ❌ Không tự thay đổi schema database mà không có instruction từ Claude
- ❌ Không tạo Edge Function mới nếu chưa kiểm tra danh sách 8 functions hiện có
- ❌ Không bypass RLS bằng `service_role` key trong frontend code
- ❌ Không hardcode Supabase URL/key — luôn đọc từ `import.meta.env`
- ❌ Không dùng `any` trong TypeScript
- ❌ Không commit trực tiếp lên `main` nếu có breaking migration chưa test
