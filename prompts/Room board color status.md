# Room Board — Tô màu phòng theo trạng thái (Trống / Đang ở / Trả phòng hôm nay)

## Why

`RoomBoard` hiện chỉ tô màu dot trạng thái (`dotGo`, `dotOcc`, `dotHold`, `dotStop`), chưa tô nền cả dòng. Yêu cầu:

| Trạng thái | Hành động |
|---|---|
| Trống | Giữ nguyên nền mặc định — không đổi |
| Đang ở | Tô nền dòng bằng `--signal-occupied-bg` (đã có sẵn) |
| Check-out hôm nay | Tô nền khác — cần token màu mới |

`getRoomBoardState()` hiện gộp toàn bộ `status === 'checked-in'` vào 1 state `'occupied'`, không phân biệt khách trả phòng **hôm nay** với khách còn ở dài ngày. Cần tách thêm state `'checkout_today'` bằng cách so `room.check_out` với ngày hiện tại (field đã có sẵn trong `DashboardRoom`, không cần đổi schema/view `dashboard_today`).

Màu mới `--signal-checkout` (vàng đồng) được thêm theo đúng convention token hiện có (`--signal-go/hold/stop/occupied`), khác với `hold` (đất nung = đang dọn) và `stop` (đỏ = quá hạn) để tránh nhầm ý nghĩa.

Housekeeping / blocked / vacant giữ nguyên hành vi cũ.

## DB

Không cần migration. `check_out` đã có sẵn trong view `dashboard_today` / type `DashboardRoom`. Toàn bộ xử lý ở frontend.

## Frontend

### 1. `src/theme/tokens.css`

Tìm trong block `:root` (light mode):

```css
  --signal-occupied: #4A4A52; /* xám than — đang ở */
  --signal-occupied-bg: #E7E7E5;
```

Thay bằng:

```css
  --signal-occupied: #4A4A52; /* xám than — đang ở */
  --signal-occupied-bg: #E7E7E5;
  --signal-checkout: #A6741C;    /* vàng đồng — trả phòng hôm nay, cần dọn sau khi khách đi */
  --signal-checkout-bg: #F2E8CF;
```

Tìm trong block `[data-theme='dark']`:

```css
  --signal-occupied: #ACACB4;
  --signal-occupied-bg: #232325;
```

Thay bằng:

```css
  --signal-occupied: #ACACB4;
  --signal-occupied-bg: #232325;
  --signal-checkout: #D9B563;
  --signal-checkout-bg: #332C18;
```

### 2. `src/features/dashboard/utils/roomBoardState.ts` — ghi đè toàn bộ file

```ts
// FILE: src/features/dashboard/utils/roomBoardState.ts
import dayjs from 'dayjs'
import type { DashboardRoom } from '@/types/dashboard'

export type RoomBoardState =
  | 'blocked'
  | 'checkout_today'
  | 'occupied'
  | 'cleaning'
  | 'out_of_order'
  | 'vacant'

/**
 * Quy tắc ưu tiên cho Room Board (gộp booking + housekeeping vào 1 trạng thái hiển thị):
 * 1. is_blocked (OTA/manual block)          -> 'blocked' — không cho check-in qua board
 * 2. checked-in VÀ check_out = hôm nay      -> 'checkout_today' — cần trả phòng hôm nay
 * 3. checked-in còn lại                     -> 'occupied'
 * 4. housekeeping dirty/cleaning            -> 'cleaning'
 * 5. housekeeping out_of_order              -> 'out_of_order'
 * 6. còn lại (housekeeping clean, trống)    -> 'vacant'
 */
export function getRoomBoardState(room: DashboardRoom): RoomBoardState {
  if (room.is_blocked) {
    return 'blocked'
  }

  if (room.status === 'checked-in') {
    const isCheckoutToday = room.check_out != null && dayjs(room.check_out).isSame(dayjs(), 'day')
    return isCheckoutToday ? 'checkout_today' : 'occupied'
  }

  if (room.housekeeping_status === 'dirty' || room.housekeeping_status === 'cleaning') {
    return 'cleaning'
  }

  if (room.housekeeping_status === 'out_of_order') {
    return 'out_of_order'
  }

  return 'vacant'
}

// Helper: gộp nhóm "đang có khách ở" (occupied + checkout hôm nay) — tránh lặp điều kiện
// `state === 'occupied' || state === 'checkout_today'` ở nhiều nơi trong RoomBoard.tsx
export function isOccupiedLikeState(state: RoomBoardState): boolean {
  return state === 'occupied' || state === 'checkout_today'
}
```

### 3. `src/features/dashboard/components/RoomBoard.module.css`

Tìm:

```css
.dotGo { color: var(--signal-go); }
.dotHold { color: var(--signal-hold); }
.dotOcc { color: var(--signal-occupied); }
.dotStop { color: var(--signal-stop); }
```

Thay bằng:

```css
.dotGo { color: var(--signal-go); }
.dotHold { color: var(--signal-hold); }
.dotOcc { color: var(--signal-occupied); }
.dotStop { color: var(--signal-stop); }
.dotCheckout { color: var(--signal-checkout); }

/* Tô màu cả dòng theo trạng thái — "trống" giữ nguyên nền mặc định (yêu cầu 2026-07-01) */
.rowOccupied {
  background: var(--signal-occupied-bg);
}

.rowCheckoutToday {
  background: var(--signal-checkout-bg);
}
```

Tìm:

```css
.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
```

Thay bằng:

```css
.summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
```

### 4. `src/features/dashboard/components/RoomBoard.tsx`

**a) Import thêm helper**

Tìm:

```tsx
import { getRoomBoardState, type RoomBoardState } from '@/features/dashboard/utils/roomBoardState'
```

Thay bằng:

```tsx
import { getRoomBoardState, isOccupiedLikeState, type RoomBoardState } from '@/features/dashboard/utils/roomBoardState'
```

**b) Guest cell — hiện tên khách cho cả checkout_today**

Tìm:

```tsx
function renderGuestCell(room: DashboardRoom, state: RoomBoardState): React.ReactNode {
  if (state === 'occupied') {
    return room.guest_name ?? '—'
  }
```

Thay bằng:

```tsx
function renderGuestCell(room: DashboardRoom, state: RoomBoardState): React.ReactNode {
  if (isOccupiedLikeState(state)) {
    return room.guest_name ?? '—'
  }
```

**c) Counts reduce — thêm key `checkout_today`**

Tìm:

```tsx
  const counts = boardRooms.reduce(
    (acc, room) => {
      acc[getRoomBoardState(room)] += 1
      return acc
    },
    { blocked: 0, occupied: 0, cleaning: 0, out_of_order: 0, vacant: 0 } as Record<RoomBoardState, number>,
  )
```

Thay bằng:

```tsx
  const counts = boardRooms.reduce(
    (acc, room) => {
      acc[getRoomBoardState(room)] += 1
      return acc
    },
    { blocked: 0, occupied: 0, checkout_today: 0, cleaning: 0, out_of_order: 0, vacant: 0 } as Record<RoomBoardState, number>,
  )
```

**d) Summary — thêm ô "Trả phòng hôm nay"**

Tìm:

```tsx
        <div className={styles.summaryCell}>
          <span className={styles.summaryNum} style={{ color: 'var(--signal-occupied)' }}>
            {counts.occupied}
          </span>
          <span className={styles.summaryLabel}>Đang ở</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryNum} style={{ color: 'var(--signal-hold)' }}>
```

Thay bằng:

```tsx
        <div className={styles.summaryCell}>
          <span className={styles.summaryNum} style={{ color: 'var(--signal-occupied)' }}>
            {counts.occupied}
          </span>
          <span className={styles.summaryLabel}>Đang ở</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryNum} style={{ color: 'var(--signal-checkout)' }}>
            {counts.checkout_today}
          </span>
          <span className={styles.summaryLabel}>Trả hôm nay</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryNum} style={{ color: 'var(--signal-hold)' }}>
```

**e) Row — tô màu nền theo trạng thái**

Tìm:

```tsx
        {boardRooms.map((room) => {
          const state = getRoomBoardState(room)
          const isMarkingThisRoom = markClean.isPending && markClean.variables?.roomId === room.room_id

          return (
            <div key={room.room_id} className={styles.row}>
```

Thay bằng:

```tsx
        {boardRooms.map((room) => {
          const state = getRoomBoardState(room)
          const isMarkingThisRoom = markClean.isPending && markClean.variables?.roomId === room.room_id

          // Tô màu cả dòng theo trạng thái — "trống" giữ nguyên, không thêm class
          const rowStateClass =
            state === 'occupied'
              ? styles.rowOccupied
              : state === 'checkout_today'
                ? styles.rowCheckoutToday
                : ''

          return (
            <div key={room.room_id} className={`${styles.row} ${rowStateClass}`}>
```

**f) Cột trạng thái — thêm case `checkout_today`**

Tìm:

```tsx
              <span className={styles.status}>
                {state === 'vacant' && <span className={styles.dotGo}>○ TRỐNG</span>}
                {state === 'occupied' && (
                  <>
                    <span className={styles.dotOcc}>● ĐANG Ở</span>
                    {/* ĐÃ SỬA: debt badge giờ là <button> bấm được, mở PaymentModal đúng phòng. */}
                    {(room.balance_due ?? 0) > 0 && (
                      <Tooltip title={`Còn nợ ${formatCurrency(room.balance_due)}đ — bấm để thanh toán`}>
                        <button
                          type="button"
                          className={styles.debtBadge}
                          onClick={() => onPaymentClick(room)}
                        >
                          ●
                        </button>
                      </Tooltip>
                    )}
                  </>
                )}
                {state === 'cleaning' && <span className={styles.dotHold}>◐ ĐANG DỌN</span>}
                {state === 'out_of_order' && <span className={styles.dotStop}>✕ HỎNG/KHÓA</span>}
                {state === 'blocked' && <span className={styles.dotOcc}>◼ ĐÓNG</span>}
              </span>
```

Thay bằng:

```tsx
              <span className={styles.status}>
                {state === 'vacant' && <span className={styles.dotGo}>○ TRỐNG</span>}
                {isOccupiedLikeState(state) && (
                  <>
                    {state === 'occupied' && <span className={styles.dotOcc}>● ĐANG Ở</span>}
                    {state === 'checkout_today' && (
                      <span className={styles.dotCheckout}>● TRẢ HÔM NAY</span>
                    )}
                    {/* ĐÃ SỬA: debt badge giờ là <button> bấm được, mở PaymentModal đúng phòng. */}
                    {(room.balance_due ?? 0) > 0 && (
                      <Tooltip title={`Còn nợ ${formatCurrency(room.balance_due)}đ — bấm để thanh toán`}>
                        <button
                          type="button"
                          className={styles.debtBadge}
                          onClick={() => onPaymentClick(room)}
                        >
                          ●
                        </button>
                      </Tooltip>
                    )}
                  </>
                )}
                {state === 'cleaning' && <span className={styles.dotHold}>◐ ĐANG DỌN</span>}
                {state === 'out_of_order' && <span className={styles.dotStop}>✕ HỎNG/KHÓA</span>}
                {state === 'blocked' && <span className={styles.dotOcc}>◼ ĐÓNG</span>}
              </span>
```

**g) Cột action — cho checkout_today dùng chung nút "Trả phòng" + nút chi tiết**

Tìm:

```tsx
                {state === 'occupied' && (
                  <Button size="small" onClick={() => onCheckoutClick(room)}>
                    Trả phòng
                  </Button>
                )}
```

Thay bằng:

```tsx
                {isOccupiedLikeState(state) && (
                  <Button size="small" onClick={() => onCheckoutClick(room)}>
                    Trả phòng
                  </Button>
                )}
```

Tìm:

```tsx
                {(state === 'vacant' || state === 'occupied' || state === 'cleaning') && room.booking_id && (
```

Thay bằng:

```tsx
                {(state === 'vacant' || isOccupiedLikeState(state) || state === 'cleaning') && room.booking_id && (
```

## Sau khi apply

- **Trống** = nền mặc định (không đổi)
- **Đang ở** = nền xám nhạt (`--signal-occupied-bg`)
- **Trả phòng hôm nay** = nền vàng đồng nhạt (`--signal-checkout-bg`) + dot riêng + có trong ô đếm tổng đầu trang

## Checklist trước khi merge

- [ ] `tsc -b --noEmit` pass
- [ ] eslint pass
- [ ] Test trên mobile với account Owner
- [ ] Test trên mobile với account Staff (Lợi)
- [ ] Kiểm tra 1 phòng có khách check-out đúng hôm nay hiển thị đúng màu vàng đồng
- [ ] Kiểm tra 1 phòng có khách ở dài ngày (check-out ngày khác) vẫn hiển thị màu occupied cũ
- [ ] Merge `--no-ff`