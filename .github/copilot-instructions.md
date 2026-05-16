# GitHub Copilot Instructions — Hello Dalat PMS

## AI Workflow

| Role | Tool | Nhiệm vụ |
|---|---|---|
| Lead Developer | Claude (claude.ai) | Architecture, schema, code review, quyết định kỹ thuật |
| Code Writer | GitHub Copilot Agent (VSCode) | Implement theo chỉ dẫn Claude — không tự plan |
| Product Owner | Hiếu | Quyết định cuối cùng |

**Quy tắc bắt buộc:**
- Nhận instruction từ Claude → apply chính xác, không rewrite hay "cải tiến" tự phát
- Không tự quyết định architecture, schema, hay thay đổi RPC logic
- Không tạo Edge Function mới nếu chưa xác nhận đủ 2 bước: (1) đã rà soát danh sách 8 functions hiện có, (2) các functions đó không đáp ứng được yêu cầu mới
- Nếu instruction thiếu tham số bắt buộc, có chi tiết mâu thuẫn, hoặc không thể implement do thiếu context → dừng và hỏi lại Claude để làm rõ, không đoán

**Thứ tự ưu tiên khi có xung đột:**
1. Instruction từ Claude luôn là ưu tiên cao nhất.
2. Nếu instruction của Claude chưa rõ hoặc mâu thuẫn nội bộ: dừng và hỏi lại Claude, chưa code.
3. Chỉ khi instruction của Claude đã rõ: áp dụng các rule trong file này để implement.

**Coding Rules (ưu tiên theo nhóm, ngắn gọn):**
1. Chất lượng code
  - Comment tiếng Việt.
  - TypeScript strict, không dùng `any`.
  - Ví dụ: ưu tiên `unknown` + type guard thay cho `any`.
2. Async và xử lý lỗi
  - Mọi async action phải có loading state + try/catch + toast.
  - RPC fail phải log chi tiết và báo user bằng message cụ thể.
  - Ví dụ message: "Không thể cập nhật booking. Vui lòng kiểm tra dữ liệu ngày nhận/trả phòng."
3. Database & Supabase
  - Không INSERT/UPDATE trực tiếp vào `bookings`, `payment_history`, `booking_guests` (bắt buộc qua RPC).
  - Luôn import client từ `@/lib/supabase`.
  - Không hardcode URL/key (đọc từ `import.meta.env`).
  - Không bypass RLS bằng `service_role` key ở frontend.
4. Format dữ liệu
  - Tiền: `new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)`.
  - Ngày hiển thị: `dayjs(date).format('DD/MM/YYYY')`.
  - ISO: `dayjs(date).toISOString()`.

---

## Project Info

| | |
|---|---|
| **App** | Hello Dalat PMS — hostel management system |
| **URL** | https://hello-dalat-hostel-pms.vercel.app |
| **Supabase project** | `rcfhhgywjdwqcgnpkbtl` |
| **Deploy** | Vercel (auto-deploy từ `main`) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | Ant Design 5 |
| State | Zustand (auth) + TanStack Query v5 (server state) |
| Forms | React Hook Form + Zod |
| Date | dayjs |
| Routing | React Router v6 |
| Backend | Supabase (Postgres 17, Auth + RLS, Storage, Edge Functions/Deno, Realtime) |
| Testing | Vitest + React Testing Library + MSW |

---

### TanStack Query pattern
```typescript
// Query key factory
export const bookingKeys = {
  all: ['bookings'] as const,
  list: (filters?: BookingFilters) => [...bookingKeys.all, 'list', filters] as const,
  detail: (id: string) => [...bookingKeys.all, 'detail', id] as const,
}

// Mutation — luôn invalidate sau khi mutate
const mutation = useMutation({
  mutationFn: updateBooking,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
})
```

### Migration Rule (từ 30/05/2026)
Mọi table mới trong schema `public` hoặc `brain` **bắt buộc** thêm cuối migration:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.[table_name] TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.[table_name] TO authenticated;
GRANT ALL ON public.[table_name] TO service_role;
ALTER TABLE public.[table_name] ENABLE ROW LEVEL SECURITY;
```

---

## Edge Functions (Deno — không tạo thêm nếu chưa check)

```
checkin-processor   ocr-id-scanner    checkin-reminder
daily-revenue       daily-revenue-summary
tax-reminder        dk13-reminder     ical-feed
```

---

## Database Schema

### ENUMs
```
booking_status    : booked | checked-in | checked-out | cancelled
booking_source    : Booking.com | Facebook | Gọi điện/Zalo | Khách quen | Walk-in | Other
payment_method    : cash | transfer | card | other | momo | zalopay
block_reason      : maintenance | owner_use | ota_closed | deep_cleaning | other
pricing_rule_type : weekend | peak_season | holiday | custom
document_type     : CCCD | Hộ chiếu | Giấy tờ khác
residency_type    : Thường trú | Tạm trú | Địa chỉ khác
doc_kind          : booking_confirmation | deposit_request | deposit_confirmation | invoice | arrival_notice
doc_format        : pdf | zalo_text | email_html
expense_category  : Lương nhân viên | Điện nước | Vệ sinh | Sửa chữa | Marketing | Khác | Thuế & Phí
bot_lead_status   : pending | closed | converted
user_role         : owner | staff
```

### Bảng chính
```sql
rooms (
  id          TEXT PRIMARY KEY,  -- '101','102'...'302'
  name        TEXT,
  type        TEXT,              -- family|single|deluxe_double|deluxe_queen|standard_double
  capacity    INTEGER,
  base_price  INTEGER,
  floor       INTEGER,
  is_active   BOOLEAN DEFAULT TRUE
)

groups (
  id               UUID PRIMARY KEY,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  customer_note    TEXT,
  customer_cccd    TEXT,
  source           booking_source,
  channel_fee_rate NUMERIC(4,3) DEFAULT 0,
  paid             INTEGER DEFAULT 0,
  net_revenue      INTEGER DEFAULT 0,  -- tính bởi trigger
  status           TEXT DEFAULT 'active'
)

bookings (
  id            UUID PRIMARY KEY,
  group_id      UUID REFERENCES groups(id),
  room_id       TEXT REFERENCES rooms(id),
  check_in      DATE NOT NULL,
  check_out     DATE NOT NULL,
  nights        INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,
  price         INTEGER DEFAULT 0,
  surcharge     INTEGER DEFAULT 0,
  grand_total   INTEGER,           -- tính bởi trigger
  tax_rate      NUMERIC(4,3) DEFAULT 0,
  tax_amount    INTEGER DEFAULT 0,
  guest_name    TEXT,
  guests_count  INTEGER DEFAULT 1,
  status        booking_status DEFAULT 'booked',
  is_deleted    BOOLEAN DEFAULT FALSE,
  note          TEXT
)

customers (
  id              UUID PRIMARY KEY,
  full_name       TEXT NOT NULL,
  date_of_birth   DATE,
  gender          TEXT,              -- 'Nam' | 'Nữ'
  nationality     CHAR(3),           -- ISO alpha-3: VNM, USA, GBR...
  country         CHAR(3),
  document_type   document_type,
  document_number TEXT,
  phone           TEXT,
  residency_type  residency_type,
  province        TEXT,
  district        TEXT,
  ward            TEXT,
  address_detail  TEXT
)

booking_guests (
  id          UUID PRIMARY KEY,
  booking_id  UUID REFERENCES bookings(id),
  customer_id UUID REFERENCES customers(id),
  is_primary  BOOLEAN DEFAULT FALSE,
  UNIQUE (booking_id, customer_id)
  -- Partial unique index: chỉ 1 khách is_primary = TRUE per booking
)

booking_services (
  id         UUID PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id),
  service_id TEXT REFERENCES services(id),
  name       TEXT NOT NULL,
  price      INTEGER NOT NULL,
  qty        NUMERIC(10,2) DEFAULT 1
)

booking_discounts (
  id          UUID PRIMARY KEY,
  booking_id  UUID REFERENCES bookings(id),
  amount      INTEGER NOT NULL,
  description TEXT
)

payment_history (
  id       UUID PRIMARY KEY,
  group_id UUID REFERENCES groups(id),
  amount   INTEGER NOT NULL,
  method   payment_method,
  date     DATE NOT NULL,
  note     TEXT
)

room_blocks (
  id         UUID PRIMARY KEY,
  room_id    TEXT REFERENCES rooms(id),
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  reason     block_reason DEFAULT 'other',
  note       TEXT
)

expenses (
  id          UUID PRIMARY KEY,
  category    expense_category DEFAULT 'Khác',
  description TEXT,
  amount      INTEGER DEFAULT 0,
  date        DATE NOT NULL,
  is_deleted  BOOLEAN DEFAULT FALSE
)

services (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  price      INTEGER NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
)

app_users (
  id    UUID PRIMARY KEY,
  email TEXT UNIQUE,
  name  TEXT,
  role  user_role DEFAULT 'staff'
)
```

### Bảng phụ trợ
```sql
pricing_rules (
  id          UUID PRIMARY KEY,
  name        TEXT,
  rule_type   pricing_rule_type,
  room_id     TEXT REFERENCES rooms(id),  -- NULL = áp dụng tất cả phòng
  multiplier  NUMERIC,                    -- VD: 1.15
  flat_amount INTEGER,                    -- hoặc dùng flat thay multiplier
  start_date  DATE,
  end_date    DATE,
  day_of_week INTEGER[],                  -- 0=CN, 1=T2... (dùng cho weekend)
  priority    INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE
)

revenue_manual_log (
  id          UUID PRIMARY KEY,
  period      DATE,                       -- ngày đầu tháng
  source      TEXT,
  description TEXT,
  amount      INTEGER,
  note        TEXT
)

bot_leads (
  id        UUID PRIMARY KEY,
  chat_id   BIGINT NOT NULL,             -- Telegram chat_id
  content   TEXT NOT NULL,
  remind_at TIMESTAMPTZ,
  status    bot_lead_status DEFAULT 'pending',
  group_id  UUID REFERENCES groups(id)
)

document_logs (
  id               UUID PRIMARY KEY,
  group_id         UUID REFERENCES groups(id),
  booking_id       UUID REFERENCES bookings(id),
  doc_type         doc_kind,
  doc_format       doc_format,
  content_snapshot JSONB DEFAULT '{}',
  generated_by     UUID,
  sent_via         TEXT,
  recipient_name   TEXT,
  recipient_phone  TEXT,
  note             TEXT
)

ota_calendar_feed (
  id              UUID PRIMARY KEY,
  room_id         TEXT REFERENCES rooms(id),
  ical_uid        TEXT,
  ota_source      TEXT DEFAULT 'Booking.com',
  check_in        DATE,
  check_out       DATE,
  summary         TEXT,
  status          TEXT,
  ota_booking_num TEXT,
  linked_group_id UUID REFERENCES groups(id),
  last_synced_at  TIMESTAMPTZ DEFAULT now()
)

tours (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  partner         TEXT,
  duration        TEXT,
  price_weekday   INTEGER,
  price_weekend   INTEGER,
  pickup_time     TEXT,
  suitable_for    TEXT,
  included        TEXT,
  not_included    TEXT,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE
)
```

### RPC Functions — PHẢI dùng thay vì INSERT/UPDATE trực tiếp

Nếu RPC fail do input không hợp lệ hoặc thiếu tham số: phải log rõ payload đầu vào, thông tin lỗi trả về, và hiển thị message cụ thể cho user để họ biết cần sửa trường nào.

```typescript
// Tạo Group + Bookings + Services + Discounts trong 1 transaction
supabase.rpc('create_group_booking_txn', {
  p_group:     { customer_name, customer_phone, source, channel_fee_rate },
  p_bookings:  [{ room_id, check_in, check_out, price, guests_count }],
  p_services:  [{ service_id, booking_index, qty }],   // booking_index = 0-based
  p_discounts: [{ amount, description, booking_index }]
})
// Returns: { success, group_id, booking_ids[] }

// Cập nhật booking (room, dates, price, status, cancel)
supabase.rpc('update_booking_txn', {
  p_booking_id:  UUID,
  p_room_id:     string | null,
  p_check_in:    string | null,   // YYYY-MM-DD
  p_check_out:   string | null,
  p_price:       number | null,
  p_guests_count:number | null,
  p_guest_name:  string | null,
  p_note:        string | null,
  p_cancel:      boolean          // true = huỷ booking
})

// Check-in: upsert customers + link booking_guests + update status → 'checked-in'
supabase.rpc('checkin_booking_txn', {
  p_booking_id: UUID,
  p_guests:     JSON   // CheckInCustomerPayload[]
})

// Check-out booking đơn lẻ (có thể còn nợ)
supabase.rpc('process_check_out_txn', {
  p_booking_id:   UUID,
  p_confirm_debt: boolean   // true = xác nhận checkout dù còn nợ
})

// Check-out nhiều booking trong 1 group + thanh toán cuối
supabase.rpc('checkout_group_txn', {
  p_group_id:       UUID,
  p_booking_ids:    UUID[],
  p_payment_amount: number,            // 0 nếu không thanh toán thêm
  p_payment_method: payment_method | null,
  p_note:           string | null
})

// Ghi nhận thanh toán (tự xử lý 4% surcharge nếu method = card)
supabase.rpc('record_payment_txn', {
  p_group_id:         UUID,
  p_amount:           number,
  p_method:           payment_method,
  p_note:             string | null,
  p_first_booking_id: UUID | null      // BẮT BUỘC nếu method = 'card'
})

// Kiểm tra phòng trống
supabase.rpc('check_room_availability', {
  p_room_id:            string,
  p_check_in:           string,        // YYYY-MM-DD
  p_check_out:          string,
  p_exclude_booking_id: UUID | null
})
// Returns: { available, conflict_type, conflict_id, conflict_check_in, conflict_check_out }

// Giá đề xuất theo pricing_rules
supabase.rpc('get_suggested_price', {
  p_room_id: string,
  p_date:    string   // YYYY-MM-DD
})
// Returns: number (VND)

// Lấy role của user đang đăng nhập
supabase.rpc('current_user_role')
// Returns: 'owner' | 'staff'

// Ghi document log (confirmation, invoice, v.v.)
supabase.rpc('create_document_log', {
  p_group_id:        UUID,
  p_booking_id:      UUID | null,
  p_doc_type:        doc_kind,
  p_doc_format:      doc_format,
  p_content_snapshot:JSONB,
  p_sent_via:        string | null,
  p_recipient_name:  string | null,
  p_recipient_phone: string | null,
  p_note:            string | null
})
```

### Views (chỉ SELECT, không mutate)
```typescript
// Trạng thái tất cả phòng hôm nay
supabase.from('dashboard_today').select('*')
// Columns: room_id, room_name, room_type, capacity,
//          booking_id, check_in, check_out, status,
//          guest_name, guests_count, customer_phone, source,
//          paid, net_revenue, price, grand_total, balance_due,
//          is_blocked, block_reason

// Lịch phòng hợp nhất (bookings + blocks)
supabase.from('room_calendar').select('*')
// Columns: room_id, room_name, check_in, check_out, nights,
//          booking_status, entry_type ('booking'|'block'),
//          guest_name, customer_phone, source, paid, net_revenue,
//          price, grand_total, group_id, booking_id, block_id

// Khai báo lưu trú ĐK14 — 19 cột chuẩn
supabase.from('dk14_luu_tru').select('*')

// Doanh thu theo tháng/kênh/phòng (chỉ checked-out)
supabase.from('monthly_revenue').select('*')
// Columns: month, source, room_id, booking_count, total_nights,
//          gross_room_revenue, total_tax, net_revenue, avg_channel_fee_rate
```

---

## TypeScript Interfaces

```typescript
// Output của Edge Function ocr-id-scanner
// Dùng để populate form CheckInModal
interface OcrResult {
  full_name:       string;
  date_of_birth:   string;         // DD/MM/YYYY
  gender:          'Nam' | 'Nữ';  // KHÔNG phải M/F
  nationality:     string;         // ISO alpha-3
  country:         string;
  document_type:   'CCCD' | 'Hộ chiếu' | 'Giấy tờ khác';
  document_number: string;
  province:        string;
  district:        string | null;  // null = địa chỉ mới (mặt sau CCCD)
  ward:            string;
  address_detail:  string;
  residency_type:  'Tạm trú' | null;  // null = khách nước ngoài
}

// Input của RPC checkin_booking_txn (p_guests array item)
interface CheckInCustomerPayload extends OcrResult {
  phone?: string;
  is_primary: boolean;
}

// Row từ view dashboard_today
interface DashboardRoom {
  room_id:        string;
  room_name:      string;
  room_type:      string;
  capacity:       number;
  booking_id:     string | null;
  check_in:       string | null;
  check_out:      string | null;
  status:         'booked' | 'checked-in' | 'checked-out' | null;
  guest_name:     string | null;
  guests_count:   number | null;
  customer_phone: string | null;
  source:         string | null;
  paid:           number;
  grand_total:    number | null;
  balance_due:    number;
  is_blocked:     boolean;
  block_reason:   string | null;
}

// Row từ view dk14_luu_tru
interface DK14Row {
  stt:              number;
  ho_va_ten:        string;
  ngay_sinh:        string;
  gioi_tinh:        string;
  quoc_gia:         string;
  quoc_tich:        string;
  loai_giay_to:     string;
  ten_giay_to:      string | null;
  so_giay_to:       string;
  so_dien_thoai:    string | null;
  loai_cu_tru:      string | null;
  tinh_tp:          string | null;
  quan_huyen:       string | null;
  phuong_xa:        string | null;
  dia_chi_chi_tiet: string | null;
  tu_ngay:          string;
  den_ngay:         string;
  ly_do_luu_tru:    string;
  ten_phong:        string;
  booking_id:       string;
  check_in:         string;
  check_out:        string;
  is_primary:       boolean;
}
```

---

## Quyết định nghiệp vụ đã chốt

| # | Quyết định |
|---|---|
| 1 | Không có trang Register công khai — chỉ Owner tạo tài khoản Staff |
| 2 | Sau Check-out → phòng về "Trống" ngay |
| 3 | CCCD không bắt buộc khi tạo Booking, BẮT BUỘC khi Check-in |
| 4 | Check-out khi còn nợ: CHO PHÉP, phải có checkbox xác nhận (`p_confirm_debt: true`) |
| 5 | Phụ thu thẻ 4%: method = card → +4% surcharge, truyền `p_first_booking_id` |
| 6 | Giờ check-in mặc định: 14:00 — check-out: 12:00 |
| 7 | Không bypass RLS — không dùng service_role key trong frontend |

---

## Những điều KHÔNG làm

- ❌ Không tự thay đổi schema database khi chưa có instruction từ Claude
- ❌ Không INSERT/UPDATE trực tiếp vào `bookings`, `payment_history`, `booking_guests`
- ❌ Không dùng `any` trong TypeScript
- ❌ Không hardcode Supabase URL/key
- ❌ Không dùng các legacy functions sau (vẫn tồn tại trong DB nhưng đã có RPC mới thay thế):
  - `process_checkin` → dùng `checkin_booking_txn`
  - `process_checkout` → dùng `checkout_group_txn`
  - `checkout_booking` → dùng `process_check_out_txn` hoặc `checkout_group_txn`
  - `checkout_booking_txn` → dùng `checkout_group_txn`