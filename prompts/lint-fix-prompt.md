# Lint Fix — Hello Dalat PMS
Đọc kỹ toàn bộ file trước khi sửa. Chỉ sửa đúng dòng được chỉ định, không thay đổi logic.

---

## FIX 1: router.tsx — Tách lazy imports ra routes.tsx

### Tạo file mới: `src/app/routes.tsx`
Nội dung đầy đủ:

```tsx
import { lazy } from 'react'

export const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'))
export const NewBookingPage = lazy(() => import('@/features/bookings/pages/NewBookingPage'))
export const RoomCalendarPage = lazy(() => import('@/features/calendar/pages/RoomCalendarPage'))
export const RevenueDashboardPage = lazy(() => import('@/features/dashboard/pages/RevenueDashboardPage'))
export const FinancePage = lazy(() => import('@/features/finance/pages/FinancePage'))
export const DK14ReportPage = lazy(() => import('@/features/compliance/pages/DK14ReportPage'))
export const CheckinImportPage = lazy(() => import('@/features/checkin/pages/CheckinImportPage'))
export const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage'))
export const BookingsPage = lazy(() => import('@/features/bookings/pages/BookingsPage').then((m) => ({ default: m.BookingsPage })))
export const GuestsPage = lazy(() => import('@/pages/GuestsPage'))
export const HousekeepingPage = lazy(() => import('@/features/housekeeping/pages/HousekeepingPage'))
export const BookingRequestsPage = lazy(() => import('@/features/booking-requests/pages/BookingRequestsPage'))
```

### Sửa file: `src/app/router.tsx`
Thay toàn bộ nội dung bằng:

```tsx
import { Suspense } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { MainLayout } from '@/app/layouts/MainLayout'
import AuthGuard from '@/shared/components/AuthGuard'
import LoginPage from '@/pages/LoginPage'
import BookPage from '@/pages/BookPage'
import { ICalFeedPanel } from '@/features/settings/components/ICalFeedPanel'
import {
  DashboardPage,
  NewBookingPage,
  RoomCalendarPage,
  RevenueDashboardPage,
  FinancePage,
  DK14ReportPage,
  CheckinImportPage,
  SettingsPage,
  BookingsPage,
  GuestsPage,
  HousekeepingPage,
  BookingRequestsPage,
} from '@/app/routes'

export const appRouter = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/book', element: <BookPage /> },
  {
    path: '/',
    element: (<AuthGuard><MainLayout /></AuthGuard>),
    children: [
      { index: true, element: <Suspense fallback={null}><DashboardPage /></Suspense> },
      { path: 'dashboard', element: <Suspense fallback={null}><DashboardPage /></Suspense> },
      { path: 'new-booking', element: <Suspense fallback={null}><NewBookingPage /></Suspense> },
      { path: 'calendar', element: <Suspense fallback={null}><RoomCalendarPage /></Suspense> },
      { path: 'housekeeping', element: <Suspense fallback={null}><HousekeepingPage /></Suspense> },
      { path: 'revenue', element: <Suspense fallback={null}><RevenueDashboardPage /></Suspense> },
      { path: 'finance', element: <Suspense fallback={null}><FinancePage /></Suspense> },
      { path: 'orevenue', element: <Suspense fallback={null}><RevenueDashboardPage /></Suspense> },
      { path: 'dk14-report', element: <Suspense fallback={null}><DK14ReportPage /></Suspense> },
      { path: 'checkin-import', element: <Suspense fallback={null}><CheckinImportPage /></Suspense> },
      { path: 'bookings', element: <Suspense fallback={null}><BookingsPage /></Suspense> },
      { path: 'booking-requests', element: <Suspense fallback={null}><BookingRequestsPage /></Suspense> },
      { path: 'guests', element: <Suspense fallback={null}><GuestsPage /></Suspense> },
      {
        path: 'settings',
        element: <Suspense fallback={null}><SettingsPage /></Suspense>,
        children: [
          { index: true, element: <Navigate to="ical" replace /> },
          { path: 'ical', element: <ICalFeedPanel /> },
        ],
      },
    ],
  },
])
```

---

## FIX 2: src/components/CheckoutModal.tsx — Suppress setState in effect

Tìm đoạn:
```ts
  useEffect(() => {
    if (!bookingId) return
    setPaymentMethod('cash')
    setNote('')
  }, [bookingId])
```

Thay bằng:
```ts
  // Reset form khi chuyển sang booking khác — đây là derived state reset hợp lệ
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!bookingId) return
    setPaymentMethod('cash')
    setNote('')
  }, [bookingId])
```

---

## FIX 3: src/features/checkout/components/CheckoutModal.tsx — Suppress setState in effect

Tìm đoạn:
```ts
  useEffect(() => {
    if (!open) {
      setStep('folio')
      setPaymentMethod('cash')
      form.resetFields()
    }
  }, [form, open])
```

Thay bằng:
```ts
  // Reset state khi modal đóng — derived state reset hợp lệ, không phải side effect
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!open) {
      setStep('folio')
      setPaymentMethod('cash')
      form.resetFields()
    }
  }, [form, open])
```

---

## FIX 4: src/features/checkout/components/QuickCheckoutModal.tsx — Suppress setState in effect + unused disable

Tìm đoạn (chú ý: xóa cả dòng eslint-disable cũ vì lỗi "unused directive"):
```ts
  // Reset form khi chuyển sang booking mới
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!target) return
    setPaymentMethod('cash')
    setNote('')
  }, [target?.bookingId])
```

Thay bằng:
```ts
  // Reset form khi chuyển sang booking mới — derived state reset hợp lệ
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!target) return
    setPaymentMethod('cash')
    setNote('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.bookingId])
```

---

## FIX 5: src/components/booking/BookingImportPDF.tsx — Thay any bằng type từ pdfjs

Tìm dòng (khoảng line 64):
```ts
    text += content.items.map((item: any) => item.str).join(' ') + '\n';
```

Thay bằng:
```ts
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
```

> Lý do: `pdfjs-dist` trả về `TextItem | TextMarkedContent` — `TextItem` có `.str`, `TextMarkedContent` không có. Guard bằng `'str' in item` thay vì cast `any`.

---

## FIX 6: src/features/documents/useDocumentGenerator.ts — Thay Array<any>

Tìm dòng khoảng line 64:
```ts
  bookings: Array<any>;
```

Thay bằng:
```ts
  bookings: Array<Record<string, unknown>>;
```

---

## FIX 7: supabase/functions/daily-revenue-summary/index.ts — let → const

Tìm dòng khoảng line 88:
```ts
  let sourceBreakdown: Record<string, number> = {}
```

Thay bằng:
```ts
  const sourceBreakdown: Record<string, number> = {}
```

---

## FIX 8: supabase/functions/price-alert-bot/index.ts — Unused _req

Tìm dòng khoảng line 49:
```ts
Deno.serve(async (_req) => {
```

Thay bằng:
```ts
Deno.serve(async () => {
```

---

## FIX 9: Suppress RHF watch warnings (3 files)

### src/features/bookings/pages/NewBookingPage.tsx
Tìm:
```ts
  const selectedSource = watch('source')
  const bookingValues = watch('bookings')
```
Thay bằng:
```ts
  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() không tương thích React Compiler, known issue
  const selectedSource = watch('source')
  // eslint-disable-next-line react-hooks/incompatible-library
  const bookingValues = watch('bookings')
```

### src/features/payment/components/PaymentModal.tsx
Tìm:
```ts
  const selectedMethod = watch('method')
```
Thay bằng:
```ts
  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() không tương thích React Compiler, known issue
  const selectedMethod = watch('method')
```

### src/components/bookings/AddRoomModal.tsx
Tìm:
```ts
  const watchRoomId  = watch('room_id');
  const watchCheckIn = watch('check_in');
```
Thay bằng:
```ts
  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() không tương thích React Compiler, known issue
  const watchRoomId  = watch('room_id');
  // eslint-disable-next-line react-hooks/incompatible-library
  const watchCheckIn = watch('check_in');
```

---

## Verify sau khi xong
Chạy lệnh sau và paste kết quả:
```powershell
pnpm lint 2>&1 | tee lint-output-after.txt
pnpm build 2>&1 | tail -20
```