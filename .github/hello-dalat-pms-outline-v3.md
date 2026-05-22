# Hello Dalat PMS — Repo Structure & Roadmap
> v3 — gap analysis & confirmed 2026-05-21  
> Kiến trúc: Feature-based colocation  
> Stack: React 18 + TS + Vite + Ant Design 5 + Supabase  
> Deploy: Vercel → https://hello-dalat-hostel-pms.vercel.app

---

## PHẦN 1 — FOLDER STRUCTURE

```
hello-dalat-pms/
├── .github/
│   ├── copilot-instructions.md          ← Rules cho Copilot (v4, cập nhật 2026-05-21)
│   └── hello-dalat-pms-outline-v3.md   ← File này
│
├── public/
│   └── favicon.ico
│
├── src/
│   ├── main.tsx                         ← Entry point
│   ├── App.tsx                          ← Router root + AuthGuard
│   ├── vite-env.d.ts
│   │
│   ├── lib/
│   │   ├── supabase.ts                  ← Supabase client (import.meta.env)
│   │   └── queryClient.ts               ← TanStack Query client config
│   │
│   ├── types/
│   │   ├── supabase.ts                  ← Generated types từ Supabase CLI
│   │   └── global.ts                    ← Shared enums, common types
│   │
│   ├── store/
│   │   └── authStore.ts                 ← Zustand: user session + role
│   │
│   ├── router/
│   │   ├── index.tsx                    ← Route definitions
│   │   ├── AuthGuard.tsx                ← Redirect nếu chưa login
│   │   └── RoleGuard.tsx                ← Chặn staff vào trang owner-only
│   │                                       (dùng RPC current_user_role)
│   │
│   ├── components/                      ← Shared UI (không thuộc feature nào)
│   │   ├── AppLayout.tsx                ← Ant Design Layout + Sidebar
│   │   ├── PageHeader.tsx
│   │   ├── StatusBadge.tsx              ← Badge cho booking_status
│   │   ├── MoneyText.tsx                ← Format VND
│   │   ├── DateRangeDisplay.tsx
│   │   └── housekeeping/
│   │       └── HousekeepingBadge.tsx    ← Badge + Dropdown cập nhật trạng thái dọn phòng
│   │                                       (dùng trong CalendarTimeline)
│   │
│   └── features/
│       │
│       ├── auth/
│       │   ├── pages/
│       │   │   └── LoginPage.tsx        ✅ done
│       │   ├── hooks/
│       │   │   └── useAuth.ts
│       │   └── types/
│       │       └── auth.types.ts
│       │
│       ├── dashboard/
│       │   ├── pages/
│       │   │   └── DashboardPage.tsx    ✅ done
│       │   ├── components/
│       │   │   ├── RoomCard.tsx         ✅ done — số phòng + 3 nút conditional
│       │   │   ├── RoomGrid.tsx         ✅ done
│       │   │   └── QuickCheckoutModal.tsx ✅ done — chỉ ở đây, không ở checkout
│       │   ├── hooks/
│       │   │   └── useDashboardToday.ts ← Query view dashboard_today
│       │   └── types/
│       │       └── dashboard.types.ts   ← DashboardRoom interface
│       │
│       ├── calendar/
│       │   ├── pages/
│       │   │   └── CalendarPage.tsx     ✅ done — có tab OTA (phase 3)
│       │   ├── components/
│       │   │   ├── CalendarTimeline.tsx ✅ done — ghép HousekeepingBadge vào
│       │   │   │                           calendar-room-cell (phase 3.4)
│       │   │   ├── BookingBar.tsx       ← Block booking trên timeline
│       │   │   ├── BlockBar.tsx         ← Block room_blocks trên timeline
│       │   │   ├── CalendarDrawer.tsx   ✅ done — Check-in/Check-out buttons
│       │   │   └── OtaFeedTab.tsx       ← Tab OTA: hiển thị ota_calendar_feed
│       │   │                               (linked/unlinked, source, booking_num)
│       │   ├── hooks/
│       │   │   ├── useRoomCalendar.ts   ← Query view room_calendar
│       │   │   │                           + map housekeeping_status vào RoomRow
│       │   │   └── useOtaFeed.ts        ← Query ota_calendar_feed
│       │   └── types/
│       │       └── calendar.types.ts    ← RoomRow phải có housekeeping_status + housekeeping_note
│       │
│       ├── bookings/
│       │   ├── pages/
│       │   │   ├── BookingsPage.tsx     ✅ done — search/filter/drawer
│       │   │   └── NewBookingPage.tsx   ✅ done — services + discounts + deposit
│       │   ├── components/
│       │   │   ├── BookingDetailDrawer.tsx ✅ done
│       │   │   ├── BookingStatusTag.tsx
│       │   │   ├── RoomAvailabilityPicker.tsx
│       │   │   ├── ServicesInput.tsx    ✅ done
│       │   │   ├── DiscountsInput.tsx   ✅ done
│       │   │   └── PriceSummary.tsx     ← Đọc từ DB — KHÔNG tự tính
│       │   ├── hooks/
│       │   │   ├── useBookingsList.ts   ✅ done
│       │   │   ├── useBookingDetail.ts
│       │   │   ├── useCreateBooking.ts  ← RPC create_group_booking_txn
│       │   │   ├── useUpdateBooking.ts  ← RPC update_booking_txn
│       │   │   ├── useCancelBooking.ts  ← update_booking_txn (p_cancel: true)
│       │   │   └── useRoomAvailability.ts ← RPC check_room_availability
│       │   └── types/
│       │       └── booking.types.ts
│       │
│       ├── checkin/                     ✅ done (end-to-end, 2026-05-11)
│       │   ├── components/
│       │   │   ├── CheckInModal.tsx     ✅ done
│       │   │   └── GuestForm.tsx        ✅ done — nhập tay, KHÔNG có OCR
│       │   ├── hooks/
│       │   │   ├── useCheckIn.ts        ✅ done — RPC process_check_in_txn
│       │   │   └── useCheckinImport.ts  ✅ done — import danh sách từ Excel
│       │   ├── utils/
│       │   │   └── parseCheckinExcel.ts ✅ done — parse Excel multi-room
│       │   └── types/
│       │       └── checkin.types.ts     ← CheckInCustomerPayload (không có OcrResult)
│       │
│       ├── checkout/
│       │   ├── components/
│       │   │   └── CheckoutModal.tsx    ← Folio đầy đủ (debt warning + confirm)
│       │   │   -- Lưu ý: QuickCheckoutModal nằm ở features/dashboard/
│       │   ├── hooks/
│       │   │   ├── useCheckout.ts       ← RPC checkout_booking_txn
│       │   │   │                           (có debt warning, p_confirm_debt)
│       │   │   └── useGroupCheckout.ts  ← RPC checkout_group_txn
│       │   └── types/
│       │       └── checkout.types.ts
│       │
│       ├── payments/
│       │   ├── components/
│       │   │   ├── PaymentModal.tsx     ← Ghi nhận thanh toán
│       │   │   ├── PaymentHistory.tsx   ← Lịch sử thanh toán của group
│       │   │   └── CardSurchargeNote.tsx ← Note +4% nếu chọn card
│       │   ├── hooks/
│       │   │   └── useRecordPayment.ts  ← RPC record_payment_txn
│       │   │                               (p_first_booking_id bắt buộc nếu card)
│       │   └── types/
│       │       └── payment.types.ts
│       │
│       ├── guests/
│       │   ├── pages/
│       │   │   └── GuestsPage.tsx       ← Danh sách khách đã lưu trú
│       │   ├── components/
│       │   │   ├── GuestDetailDrawer.tsx
│       │   │   └── DK14Table.tsx        ← View dk14_luu_tru → xuất báo cáo
│       │   ├── hooks/
│       │   │   ├── useGuestsList.ts
│       │   │   └── useDK14.ts
│       │   └── types/
│       │       └── guest.types.ts       ← DK14Row interface (19 cột)
│       │
│       ├── rooms/
│       │   ├── pages/
│       │   │   └── RoomsPage.tsx        ← Quản lý phòng + blocks
│       │   ├── components/
│       │   │   ├── RoomBlockModal.tsx   ← Tạo/xóa block
│       │   │   └── RoomSettingsForm.tsx ← Sửa base_price, capacity
│       │   ├── hooks/
│       │   │   ├── useRooms.ts          ← SELECT bao gồm housekeeping_status + housekeeping_note
│       │   │   ├── useRoomBlocks.ts
│       │   │   └── useHousekeeping.ts   ← UPDATE rooms.housekeeping_status (mutation)
│       │   └── types/
│       │       └── room.types.ts        ← HousekeepingStatus type + Room interface đầy đủ
│       │
│       ├── finance/
│       │   ├── pages/
│       │   │   └── FinancePage.tsx      ✅ done — deployed 2026-05-18
│       │   ├── components/
│       │   │   ├── RevenueChart.tsx     ✅ done
│       │   │   ├── ExpenseTable.tsx     ✅ done
│       │   │   ├── RevenueSummaryCard.tsx ✅ done
│       │   │   └── ManualRevenueModal.tsx ← Nhập revenue_manual_log thủ công
│       │   ├── hooks/
│       │   │   ├── useFinanceMonthlyRevenue.ts ← Query finance_monthly_revenue
│       │   │   │                                  (KHÔNG dùng monthly_revenue cũ)
│       │   │   ├── useExpenses.ts
│       │   │   └── useManualRevenue.ts  ← CRUD revenue_manual_log
│       │   └── types/
│       │       └── finance.types.ts
│       │
│       ├── documents/
│       │   ├── components/
│       │   │   ├── DocumentActionsMenu.tsx ⚠️ orphan — review trước khi build thêm
│       │   │   ├── DepositRequestTemplate.tsx  ← phase 2.6
│       │   │   ├── BookingConfirmTemplate.tsx  ← phase 2.6
│       │   │   └── InvoiceTemplate.tsx         ← phase 2.6
│       │   ├── hooks/
│       │   │   └── useCreateDocument.ts ← RPC create_document_log
│       │   └── types/
│       │       └── document.types.ts
│       │
│       ├── tours/
│       │   ├── pages/
│       │   │   └── TourListPage.tsx     ← CRUD tours (owner only)
│       │   ├── components/
│       │   │   └── TourSuggestCard.tsx  ← Gợi ý tour cho khách
│       │   │                               (dùng trong CheckInModal hoặc documents)
│       │   ├── hooks/
│       │   │   └── useTours.ts          ← Query/mutate tours table
│       │   └── types/
│       │       └── tour.types.ts
│       │
│       └── settings/                    ← Owner only
│           ├── pages/
│           │   └── SettingsPage.tsx
│           ├── components/
│           │   ├── UserManagement.tsx   ← Tạo tài khoản staff (không có public register)
│           │   ├── PricingRulesTable.tsx ← CRUD pricing_rules
│           │   └── ServicesTable.tsx    ← CRUD services catalog
│           └── hooks/
│               ├── usePricingRules.ts
│               └── useServices.ts
│
├── supabase/
│   ├── functions/                       ← 8 Edge Functions — KHÔNG tạo thêm khi chưa check
│   │   ├── checkin-processor/
│   │   ├── ocr-id-scanner/              ← Giữ trên server, KHÔNG có UI gọi đến
│   │   ├── checkin-reminder/
│   │   ├── daily-revenue/
│   │   ├── daily-revenue-summary/
│   │   ├── tax-reminder/
│   │   ├── dk13-reminder/
│   │   └── ical-feed/
│   └── migrations/                      ← YYYYMMDDHHMMSS_ten_migration.sql
│
├── .env.local                           ← VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
├── .env.example
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## PHẦN 2 — RPC REFERENCE (active only)

> Legacy đã loại: `checkout_booking`, `process_checkout`  
> Dùng đúng RPC — không gọi legacy

| RPC | Dùng ở hook | Ghi chú |
|---|---|---|
| `create_group_booking_txn` | `useCreateBooking` | `p_bookings[].price_per_night` — KHÔNG phải `price` |
| `update_booking_txn` | `useUpdateBooking`, `useCancelBooking` | `p_price_per_night`, `p_cancel: true` để huỷ |
| `process_check_in_txn` | `useCheckIn` | Upsert customers + link booking_guests |
| `checkout_booking_txn` | `useCheckout` | Có debt warning, trả `warning` field |
| `checkout_group_txn` | `useGroupCheckout` | Checkout nhiều booking + payment cuối |
| `record_payment_txn` | `useRecordPayment` | `p_first_booking_id` bắt buộc nếu `method = card` |
| `check_room_availability` | `useRoomAvailability` | Trả `conflict_type` nếu bị chặn |
| `get_suggested_price` | inline trong NewBookingPage | Trả number (VND) |
| `create_document_log` | `useCreateDocument` | |
| `current_user_role` | `RoleGuard` | Phân quyền owner/staff |

---

## PHẦN 3 — ROUTING MAP

```
/login          → LoginPage        (public)
/               → DashboardPage    (auth)
/calendar       → CalendarPage     (auth) — có tab OTA
/bookings       → BookingsPage     (auth)
/bookings/new   → NewBookingPage   (auth)
/guests         → GuestsPage       (auth)
/rooms          → RoomsPage        (owner only)
/finance        → FinancePage      (owner only)
/tours          → TourListPage     (owner only)
/settings       → SettingsPage     (owner only)
```

---

## PHẦN 4 — ROADMAP

### ✅ Đã hoàn thành

| Feature | Ghi chú |
|---|---|
| Login Page | |
| Dashboard — RoomGrid + RoomCard + QuickCheckoutModal | 3 nút conditional |
| Calendar — Timeline + CalendarDrawer | Check-in/out buttons |
| Bookings List Page | Search/filter/drawer |
| New Booking Page | Services + discounts + deposit |
| Check-in flow | Excel import + GuestForm, end-to-end |
| Finance Page | RevenueChart + ExpenseTable, deployed 2026-05-18 |
| Deploy Vercel | https://hello-dalat-hostel-pms.vercel.app |
| Housekeeping — migration DB | Enum + cột + trigger đã chạy production 2026-05-21 |

---

### 🔄 Phase 2.6 — Đang làm

| # | Feature | File | Size |
|---|---|---|---|
| 2.6.1 | Review `DocumentActionsMenu.tsx` orphan | `features/documents/components/` | XS |
| 2.6.2 | Templates khách — deposit, confirmation, invoice | `features/documents/components/` | L |
| 2.6.3 | `ManualRevenueModal` — nhập revenue thủ công | `features/finance/components/` | S |

---

### 📋 Phase 3.0 — Core hoàn chỉnh

| # | Feature | File chính | Ghi chú |
|---|---|---|---|
| 3.1 | Check-out flow — folio + debt confirm | `features/checkout/` | RPC `checkout_booking_txn` đã có |
| 3.2 | Payment recording — modal + card surcharge | `features/payments/` | RPC `record_payment_txn` đã có |
| 3.3 | Guests page + DK14 table | `features/guests/` | View `dk14_luu_tru` đã có |
| 3.4 | Housekeeping status — badge trên Tape Chart | `features/rooms/` + `features/calendar/` | Migration ĐÃ chạy production (2026-05-21). Enum: `housekeeping_status` (clean\|dirty\|cleaning\|out_of_order). Trigger tự flip `dirty` khi checkout. UI: `HousekeepingBadge` ghép vào `CalendarTimeline` (calendar-room-cell). Còn lại: type `RoomRow`, `useRooms`, `useRoomCalendar`, `CalendarTimeline.tsx` |
| 3.5 | OTA Calendar tab | `features/calendar/components/OtaFeedTab.tsx` | `ical-feed` Edge Function đã chạy |
| 3.6 | Finance — Manual revenue input | `features/finance/` | Bảng `revenue_manual_log` đã có |

---

### 🔮 Phase 4.0 — Nâng cao

| # | Feature | Ghi chú |
|---|---|---|
| 4.1 | Tours — CRUD + suggest cho khách | `features/tours/` |
| 4.2 | Pricing Rules UI | `features/settings/` |
| 4.3 | Staff management | `features/settings/` |
| 4.4 | Post-checkout feedback | Edge Function `post-checkout-message` — gửi email/Zalo cảm ơn + feedback link. Resend free tier ($0) |
| 4.5 | Realtime dashboard | Supabase Realtime — sau khi core stable |
| 4.6 | Mobile responsive | Tối ưu cho điện thoại dùng tại quầy |

> `bot_leads` — managed by Telegram bot, không có UI

---

### 🔭 Phase 5.0 — Strategic (evaluate riêng)

| # | Feature | Ghi chú |
|---|---|---|
| 5.1 | Direct booking engine | Gap revenue strategy lớn (mất 15–18% OTA commission). Scope lớn — evaluate khi Phase 4 stable. Interim: Google Forms + manual confirm |

---

## PHẦN 5 — THỨ TỰ BUILD (repo mới)

```
Chunk 1 — Nền
  src/lib/supabase.ts
  src/lib/queryClient.ts
  src/store/authStore.ts
  src/types/global.ts              ← bao gồm HousekeepingStatus type
  vite.config.ts + tsconfig.json + package.json

Chunk 2 — Auth
  features/auth/pages/LoginPage.tsx
  features/auth/hooks/useAuth.ts
  router/AuthGuard.tsx
  router/RoleGuard.tsx             ← dùng current_user_role()

Chunk 3 — Layout + Router
  src/components/AppLayout.tsx
  src/router/index.tsx
  src/App.tsx

Chunk 4 — Rooms (dependency của mọi feature)
  features/rooms/hooks/useRooms.ts          ← SELECT + housekeeping_status + housekeeping_note
  features/rooms/hooks/useHousekeeping.ts   ← UPDATE housekeeping_status mutation
  features/rooms/types/room.types.ts        ← HousekeepingStatus + Room interface đầy đủ

Chunk 5 — Dashboard
  features/dashboard/hooks/useDashboardToday.ts
  features/dashboard/components/RoomCard.tsx
  features/dashboard/components/RoomGrid.tsx
  features/dashboard/components/QuickCheckoutModal.tsx
  features/dashboard/pages/DashboardPage.tsx

Chunk 6 — Bookings
  features/bookings/hooks/ (tất cả)
  features/bookings/components/ (tất cả)
  features/bookings/pages/BookingsPage.tsx
  features/bookings/pages/NewBookingPage.tsx

Chunk 7 — Check-in
  features/checkin/utils/parseCheckinExcel.ts
  features/checkin/hooks/useCheckinImport.ts
  features/checkin/hooks/useCheckIn.ts      ← process_check_in_txn
  features/checkin/components/GuestForm.tsx
  features/checkin/components/CheckInModal.tsx

Chunk 8 — Check-out + Payments
  features/checkout/ → features/payments/
  (theo thứ tự: checkout trước, payments sau)

Chunk 9 — Guests + Finance + Documents
  (song song, không dependency lẫn nhau)

Chunk 10 — Calendar (bao gồm Housekeeping Badge)
  src/components/housekeeping/HousekeepingBadge.tsx
  features/calendar/types/calendar.types.ts  ← RoomRow + housekeeping fields
  features/calendar/hooks/useRoomCalendar.ts ← map housekeeping_status vào RoomRow
  features/calendar/components/CalendarTimeline.tsx ← ghép HousekeepingBadge
  features/calendar/components/OtaFeedTab.tsx

Chunk 11 — Tours + Settings (owner only, build cuối)
  features/tours/ → features/settings/
```

---

## PHẦN 6 — HOUSEKEEPING REFERENCE

> Migration đã chạy production: `20260521_add_housekeeping_status_to_rooms`

### Schema
```sql
-- Enum (production)
housekeeping_status: clean | dirty | cleaning | out_of_order

-- Cột trong rooms
rooms.housekeeping_status  housekeeping_status NOT NULL DEFAULT 'clean'
rooms.housekeeping_note    TEXT

-- Trigger
trg_room_dirty_on_checkout: AFTER UPDATE ON bookings
  → khi status flip sang 'checked-out'
  → tự SET rooms.housekeeping_status = 'dirty'
```

### Flow
```
Checkout → booking.status = 'checked-out'
         → trigger flip rooms.housekeeping_status = 'dirty'
         → HousekeepingBadge hiện đỏ "Cần dọn" trên Tape Chart
         → Lợi dọn xong → click badge → chọn "Sạch"
         → rooms.housekeeping_status = 'clean'
```

### Status config
| Value | Label | Màu |
|---|---|---|
| `clean` | Sạch | green |
| `dirty` | Cần dọn | red |
| `cleaning` | Đang dọn | orange |
| `out_of_order` | Bảo trì | default (grey) |
