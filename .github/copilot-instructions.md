# GitHub Copilot Instructions — Hello Dalat Hostel PMS

## Stack
- Database: PostgreSQL 17 trên Supabase
- Frontend: React 18 + TypeScript + Vite + Ant Design 5
- State: Zustand (auth) + TanStack Query v5 (server state)
- Forms: React Hook Form + Zod
- Date: dayjs

## Coding Rules
- Comment tiếng Việt
- Format tiền: `new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)`
- Format ngày: `dayjs(date).format('DD/MM/YYYY')`
- TypeScript strict — không dùng `any`
- Mọi async action: loading state + try/catch + toast
- KHÔNG INSERT/UPDATE trực tiếp — phải qua RPC

## Database Schema

### ENUMs
```sql
booking_status:   booked | checked-in | checked-out | cancelled
booking_source:   Booking.com | Facebook | Gọi điện/Zalo | Khách quen | Walk-in | Other
document_type:    CCCD | Hộ chiếu | Giấy tờ khác
residency_type:   Thường trú | Tạm trú | Địa chỉ khác
payment_method:   cash | transfer | card | other
expense_category: Lương nhân viên | Điện nước | Vệ sinh | Sửa chữa | Marketing | Khác
block_reason:     maintenance | owner_use | ota_closed | deep_cleaning | other
user_role:        owner | staff
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
  id                 UUID PRIMARY KEY,
  group_id           UUID REFERENCES groups(id),
  room_id            TEXT REFERENCES rooms(id),
  check_in           DATE NOT NULL,
  check_out          DATE NOT NULL,
  nights             INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,
  price              INTEGER DEFAULT 0,
  surcharge          INTEGER DEFAULT 0,
  grand_total        INTEGER,           -- tính bởi trigger
  tax_rate           NUMERIC(4,3) DEFAULT 0,
  tax_amount         INTEGER DEFAULT 0,
  guest_name         TEXT,
  guests_count       INTEGER DEFAULT 1,
  status             booking_status DEFAULT 'booked',
  is_deleted         BOOLEAN DEFAULT FALSE,
  note               TEXT
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
  id           UUID PRIMARY KEY,
  firebase_uid TEXT UNIQUE,
  email        TEXT UNIQUE,
  name         TEXT,
  role         user_role DEFAULT 'staff'
)
```

### RPC Functions (PHẢI dùng thay vì INSERT/UPDATE trực tiếp)

```typescript
// Tạo Group + Bookings + Services + Discounts trong 1 transaction
supabase.rpc('create_group_booking_txn', {
  p_group:     { customer_name, customer_phone, source, channel_fee_rate },
  p_bookings:  [{ room_id, check_in, check_out, price, guests_count }],
  p_services:  [{ service_id, booking_index, qty }],  // booking_index = 0-based
  p_discounts: [{ amount, description, booking_index }]
})
// Returns: { success, group_id, booking_ids[] }

// Ghi nhận thanh toán (tự xử lý 4% surcharge nếu method = card)
supabase.rpc('record_payment_txn', {
  p_group_id:         UUID,
  p_amount:           number,
  p_method:           'cash' | 'transfer' | 'card' | 'other',
  p_note:             string | null,
  p_first_booking_id: UUID | null  // BẮT BUỘC nếu method = 'card'
})

// Check-in: upsert customer + link booking_guests + update status
supabase.rpc('check_in_guest', {
  p_booking_id: UUID,
  p_customer:   JSON,   // xem interface CheckInCustomerPayload
  p_is_primary: boolean
})
// Returns: { success, customer_id, booking_id, is_primary }

// Kiểm tra phòng trống
supabase.rpc('check_room_availability', {
  p_room_id:            string,
  p_check_in:           string,   // YYYY-MM-DD
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
// Columns: stt, ho_va_ten, ngay_sinh, gioi_tinh, quoc_gia, quoc_tich,
//          loai_giay_to, ten_giay_to, so_giay_to, so_dien_thoai,
//          loai_cu_tru, tinh_tp, quan_huyen, phuong_xa, dia_chi_chi_tiet,
//          tu_ngay, den_ngay, ly_do_luu_tru, ten_phong,
//          booking_id, check_in, check_out, is_primary

// Doanh thu theo tháng/kênh/phòng (chỉ checked-out)
supabase.from('monthly_revenue').select('*')
// Columns: month, source, room_id, booking_count, total_nights,
//          gross_room_revenue, total_tax, net_revenue, avg_channel_fee_rate
```

### TypeScript Interfaces quan trọng

```typescript
// Output của Edge Function ocr-id-scanner
// Dùng để populate form CheckInModal
interface OcrResult {
  full_name:       string;
  date_of_birth:   string;        // DD/MM/YYYY
  gender:          'Nam' | 'Nữ'; // KHÔNG phải M/F
  nationality:     string;        // ISO alpha-3
  country:         string;
  document_type:   'CCCD' | 'Hộ chiếu' | 'Giấy tờ khác';
  document_number: string;
  province:        string;
  district:        string | null; // null = địa chỉ mới (mặt sau CCCD)
  ward:            string;
  address_detail:  string;
  residency_type:  'Tạm trú' | null; // null = khách nước ngoài
}

// Input của RPC check_in_guest
interface CheckInCustomerPayload extends OcrResult {
  phone?: string;
}

// Row từ view dashboard_today
interface DashboardRoom {
  room_id:       string;
  room_name:     string;
  room_type:     string;
  capacity:      number;
  booking_id:    string | null;
  check_in:      string | null;
  check_out:     string | null;
  status:        'booked' | 'checked-in' | 'checked-out' | null;
  guest_name:    string | null;
  guests_count:  number | null;
  customer_phone:string | null;
  source:        string | null;
  paid:          number;
  grand_total:   number | null;
  balance_due:   number;
  is_blocked:    boolean;
  block_reason:  string | null;
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

## Quyết định nghiệp vụ đã chốt

| # | Quyết định |
|---|-----------|
| 1 | Không có trang Register công khai — chỉ Owner tạo tài khoản Staff |
| 2 | Sau Check-out → phòng về "Trống" ngay |
| 3 | CCCD không bắt buộc khi tạo Booking, BẮT BUỘC khi Check-in |
| 4 | Check-out khi còn nợ: CHO PHÉP, phải có checkbox xác nhận |
| 5 | Phụ thu thẻ 4%: method = card → +4% vào surcharge booking đầu tiên |
| 6 | Giờ check-in mặc định: 14:00 — check-out: 12:00 |