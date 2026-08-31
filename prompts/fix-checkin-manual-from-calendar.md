# Fix: Nút "Check-in" trong BookingDetailDrawer luôn mở modal Import Excel

## Bối cảnh / Root cause

`BookingDetailDrawer` (mở từ cả Calendar và Dashboard khi click vào 1 booking) render
`BookingRoomCard`, component này có 2 nút khi booking ở trạng thái `booked`:
- **"Check-in"** (icon LoginOutlined)
- **"Nhập Excel"** (icon FileExcelOutlined)

Cả 2 nút hiện đang gọi CHUNG một callback `onCheckin?.(booking.id)`. Trong
`BookingDetailDrawer`, callback này chỉ được wire để mở `CheckinImportModal`
(Excel). Do đó nút "Check-in" nhập tay **chưa từng hoạt động đúng** trong Drawer
này — bấm nút nào cũng chỉ ra được luồng import Excel.

Hệ quả thực tế: booking cũ (đã quá ngày, không còn nằm trong file Excel KBTT xuất
hàng ngày) không thể check-in lại được khi mở từ Calendar (hoặc từ Dashboard qua
Drawer này), vì đường duy nhất là Excel.

Component `CheckInModal` (nhập tay, gọi thẳng `checkin_booking_txn` qua
`useCheckIn`) đã tồn tại và đang chạy tốt ở Dashboard (`DashboardPage.tsx`) — chỉ
cần tái sử dụng nó trong `BookingDetailDrawer`, không cần viết mới.

Đã verify type: `BookingRow.check_in` / `check_out` (trong
`src/features/bookings/hooks/useBookingDetail.ts`) là `string` (date), khớp
100% với `DashboardRoom.check_in: string | null` / `check_out: string | null`
(trong `src/types/dashboard.ts`) mà `CheckInModal` đang tiêu thụ — không cần
convert kiểu, không có rủi ro type mismatch.

## Nguyên tắc

- Không sửa `CheckInModal.tsx` — giữ nguyên, chỉ tái sử dụng.
- Không sửa RPC — `checkin_booking_txn` đã đúng, vấn đề 100% ở tầng UI wiring.
- Thay đổi tối thiểu, surgical — chỉ 2 file.

---

## File 1: `src/features/bookings/components/BookingRoomCard.tsx`

### Thay đổi 1 — thêm prop `onCheckinImport` vào interface

Tìm đoạn:

```tsx
export interface BookingRoomCardProps {
  booking: BookingDetailItem
  groupId: string
  onCheckin?: (bookingId: string) => void
  onCheckout?: (bookingId: string) => void
  onAddService?: (bookingId: string) => void
  onEarlyLate?: (bookingId: string) => void
  onCancel?: (bookingId: string) => void
  onEdit?: () => void
  isCancelling?: boolean
}
```

Thay bằng:

```tsx
export interface BookingRoomCardProps {
  booking: BookingDetailItem
  groupId: string
  onCheckin?: (bookingId: string) => void
  onCheckinImport?: (bookingId: string) => void
  onCheckout?: (bookingId: string) => void
  onAddService?: (bookingId: string) => void
  onEarlyLate?: (bookingId: string) => void
  onCancel?: (bookingId: string) => void
  onEdit?: () => void
  isCancelling?: boolean
}
```

### Thay đổi 2 — nhận prop mới trong destructure của component

Tìm đoạn:

```tsx
export function BookingRoomCard({
  booking,
  groupId,
  onCheckin,
  onCheckout,
  onAddService,
  onEarlyLate,
  onCancel,
  onEdit,
  isCancelling = false,
}: BookingRoomCardProps) {
```

Thay bằng:

```tsx
export function BookingRoomCard({
  booking,
  groupId,
  onCheckin,
  onCheckinImport,
  onCheckout,
  onAddService,
  onEarlyLate,
  onCancel,
  onEdit,
  isCancelling = false,
}: BookingRoomCardProps) {
```

### Thay đổi 3 — nút "Nhập Excel" gọi `onCheckinImport` thay vì `onCheckin`

Tìm đoạn (trong khối `{canCheckin && (...)}`):

```tsx
              {canCheckin && (
                <>
                  <Button type="primary" size="small" icon={<LoginOutlined />} onClick={() => onCheckin?.(booking.id)}>
                    Check-in
                  </Button>
                  <Button size="small" icon={<FileExcelOutlined />} onClick={() => onCheckin?.(booking.id)}>
                    Nhập Excel
                  </Button>
                </>
              )}
```

Thay bằng:

```tsx
              {canCheckin && (
                <>
                  <Button type="primary" size="small" icon={<LoginOutlined />} onClick={() => onCheckin?.(booking.id)}>
                    Check-in
                  </Button>
                  <Button size="small" icon={<FileExcelOutlined />} onClick={() => onCheckinImport?.(booking.id)}>
                    Nhập Excel
                  </Button>
                </>
              )}
```

---

## File 2: `src/features/bookings/components/BookingDetailDrawer.tsx`

### Thay đổi 1 — thêm import

Tìm đoạn import `CheckinImportModal`:

```tsx
import { CheckinImportModal } from '@/features/checkin/components/CheckinImportModal'
```

Thêm ngay sau dòng đó:

```tsx
import { CheckInModal } from '@/features/checkin/components/CheckInModal'
import type { DashboardRoom } from '@/types/dashboard'
```

### Thay đổi 2 — thêm state cho check-in tay

Tìm đoạn:

```tsx
  const [editingBooking, setEditingBooking] = useState<BookingDetailItem | null>(null)
  const [checkinImportOpen, setCheckinImportOpen] = useState(false)
```

Thay bằng:

```tsx
  const [editingBooking, setEditingBooking] = useState<BookingDetailItem | null>(null)
  const [checkinImportOpen, setCheckinImportOpen] = useState(false)
  const [manualCheckinBookingId, setManualCheckinBookingId] = useState<string | null>(null)
```

### Thay đổi 3 — build object `DashboardRoom` tối thiểu để tái dùng `CheckInModal`

Tìm đoạn:

```tsx
  const totalGrandTotal = data?.grand_total ?? 0
  const balanceDue = data?.balance_due ?? 0
```

Thêm ngay TRƯỚC 2 dòng đó (giữ nguyên 2 dòng này phía sau):

```tsx
  // Tìm booking đang check-in tay để build shape DashboardRoom tối thiểu cho CheckInModal.
  // CheckInModal chỉ đọc: room_id, booking_id, guest_name, check_in, check_out — các field
  // còn lại không được component này sử dụng nên để giá trị mặc định an toàn.
  const manualCheckinBooking = data?.bookings.find((b) => b.id === manualCheckinBookingId) ?? null

  const manualCheckinRoom: DashboardRoom | null = manualCheckinBooking
    ? {
        room_id: manualCheckinBooking.room_id,
        room_name: '',
        room_type: '',
        capacity: 0,
        housekeeping_status: 'clean',
        housekeeping_note: null,
        booking_id: manualCheckinBooking.id,
        check_in: manualCheckinBooking.check_in,
        check_out: manualCheckinBooking.check_out,
        status: manualCheckinBooking.status,
        guest_name: manualCheckinBooking.guest_name,
        guests_count: manualCheckinBooking.guests_count,
        customer_phone: null,
        source: null,
        paid: null,
        net_revenue: null,
        price_per_night: null,
        grand_total: manualCheckinBooking.grand_total,
        balance_due: null,
        group_id: effectiveGroupId,
        group_grand_total: null,
        group_balance_due: null,
        group_active_booking_count: null,
        is_last_active_booking: false,
        is_blocked: false,
        block_reason: null,
      }
    : null

  const totalGrandTotal = data?.grand_total ?? 0
  const balanceDue = data?.balance_due ?? 0
```

### Thay đổi 4 — wire lại `BookingRoomCard` với 2 handler tách riêng

Tìm đoạn:

```tsx
                  <BookingRoomCard
                    key={booking.id}
                    booking={{ ...booking, services: [], discounts: [] }}
                    groupId={effectiveGroupId ?? ''}
                    isCancelling={cancelBookingMutation.isPending}
                    onCheckin={() => setCheckinImportOpen(true)}
                    onCheckout={(bookingIdToCheckout) => {
```

Thay bằng:

```tsx
                  <BookingRoomCard
                    key={booking.id}
                    booking={{ ...booking, services: [], discounts: [] }}
                    groupId={effectiveGroupId ?? ''}
                    isCancelling={cancelBookingMutation.isPending}
                    onCheckin={(bookingIdToCheckin) => setManualCheckinBookingId(bookingIdToCheckin)}
                    onCheckinImport={() => setCheckinImportOpen(true)}
                    onCheckout={(bookingIdToCheckout) => {
```

**Lưu ý:** phần còn lại của khối `<BookingRoomCard ... />` (onAddService,
onEarlyLate, ...) giữ nguyên, không đổi gì thêm.

### Thay đổi 5 — render `CheckInModal` trong Drawer

Tìm vị trí `<CheckinImportModal` được render trong JSX (thường gần cuối, cạnh
các modal khác như `CheckoutModal`). Ngay sau thẻ đóng của nó, thêm:

```tsx
      <CheckInModal
        open={!!manualCheckinBookingId}
        room={manualCheckinRoom}
        onClose={() => setManualCheckinBookingId(null)}
        onSuccess={() => {
          setManualCheckinBookingId(null)
          if (effectiveGroupId) {
            void queryClient.invalidateQueries({ queryKey: ['booking-detail', effectiveGroupId] })
          }
        }}
      />
```

---

## Kiểm tra sau khi sửa

1. `npm run typecheck` (hoặc lệnh typecheck hiện có trong repo) — không có lỗi
   type mới.
2. Mở Calendar → click 1 booking status `booked` → Drawer hiện ra → bấm nút
   **"Check-in"** → phải mở modal nhập tay (form Họ tên / CCCD / ...), KHÔNG
   phải modal Import Excel.
3. Bấm nút **"Nhập Excel"** → vẫn mở modal Import Excel như cũ (không bị đổi
   hành vi).
4. Test với 1 booking **quá khứ** (check_in đã qua nhiều ngày, không còn trong
   Excel KBTT hôm nay) → xác nhận check-in tay thành công qua
   `checkin_booking_txn`, dashboard/calendar refresh đúng trạng thái
   `checked-in`.
5. Test lại từ Dashboard (mở booking qua `BookingDetailDrawer`, không phải qua
   `CheckInModal` gốc của Dashboard) → hành vi phải nhất quán với Calendar.

## Không đụng tới

- `src/features/checkin/components/CheckInModal.tsx` — giữ nguyên 100%.
- `src/features/checkin/components/CheckinImportModal.tsx` — giữ nguyên 100%.
- RPC `checkin_booking_txn` — không đổi.
- `src/features/dashboard/pages/DashboardPage.tsx` — không đụng, luồng
  Dashboard gốc (click phòng trên Room Board) không bị ảnh hưởng bởi thay đổi
  này.
