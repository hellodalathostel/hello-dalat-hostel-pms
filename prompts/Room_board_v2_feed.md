# Room Board v2 — Re-implement sau revert v1

## Bối cảnh
Room Board v1 đã deploy live rồi bị revert (commit `bdcc916`) do bug CSS: `.row` chỉ khai 5 track
nhưng JSX render 6 ô (Phòng, Loại, Khách, Giá/đêm, Trạng thái, Action) → nút hành động
("Đã dọn xong"/"Trả phòng") bị đẩy lệch/tràn ra ngoài card.

Bản này đã sửa: thêm track thứ 6 (`110px`) cho action + thêm `<span />` trống vào header để khớp track.
Đồng thời đã gộp sẵn 2 cải tiến đã quyết định trong session trước:
1. Debt badge đổi từ `<span>` tĩnh thành `<button>` bấm được, mở `PaymentModal` đúng phòng.
2. `StatsBar` cũ bị gỡ khỏi `DashboardPage.tsx` (số liệu lệch nhau gây hiểu nhầm — StatsBar không biết housekeeping).

Production hiện tại đang ở bản `RoomCard` cũ (ổn định). Đây là lần feed lại — viết đè/tạo mới đúng 5 file dưới đây.

**Sau khi áp xong, BẮT BUỘC:**
- Chạy `tsc --noEmit`, `eslint`, `npm run build` — phải sạch.
- **Test tay trên live/preview thật** trước khi tin tưởng (lần trước skip bước này nên bug lọt qua production).
- Đặc biệt chú ý: cột action không bị lệch, debt dot bấm mở được PaymentModal, phòng có cả dòng `checked-in` và `booked` trùng ngày (ví dụ 202) không hiện lặp 2 dòng.

---

## File 1 — `src/types/dashboard.ts` (patch — thêm field, KHÔNG xoá field cũ)

Thêm các field sau vào interface `DashboardRoom` (nếu đã có sẵn các field khác thì giữ nguyên, chỉ bổ sung):

```typescript
// Đại diện một dòng dữ liệu lấy từ view dashboard_today.
export interface DashboardRoom {
  room_id: string
  room_name: string
  room_type: string
  capacity: number
  // Housekeeping — mới thêm cho Room Board
  housekeeping_status: HousekeepingStatus
  housekeeping_note: string | null
  // Booking fields — null nếu phòng trống hoặc bị block
  booking_id: string | null
  check_in: string | null
  check_out: string | null
  status: string | null
  guest_name: string | null
  guests_count: number | null
  customer_phone: string | null
  source: string | null
  paid: number | null
  net_revenue: number | null
  price: number | null            // legacy field — KHÔNG khớp tên cột thật (price_per_night), giữ nguyên không sửa, ngoài scope việc này
  price_per_night: number | null  // đúng tên cột thật trong view, Room Board dùng field này
  grand_total: number | null
  balance_due: number | null
  // Group field
  group_id: string | null
  // Block fields
  is_blocked: boolean
  block_reason: string | null
}
```

> Lưu ý: `HousekeepingStatus` type phải đã tồn tại trong file này hoặc import sẵn từ nơi khác (enum: `clean|dirty|cleaning|out_of_order`, đã có từ migration Phase 3.4). Nếu interface `DashboardRoom` đã tồn tại trong file với field khác thứ tự, chỉ cần đảm bảo đủ các field trên — không cần khớp thứ tự.

---

## File 2 — `src/features/dashboard/utils/roomBoardState.ts` (file mới)

```typescript
// FILE: src/features/dashboard/utils/roomBoardState.ts
import type { DashboardRoom } from '@/types/dashboard'

export type RoomBoardState = 'blocked' | 'occupied' | 'cleaning' | 'out_of_order' | 'vacant'

/**
 * Quy tắc ưu tiên cho Room Board (gộp booking + housekeeping vào 1 trạng thái hiển thị):
 * 1. is_blocked (OTA/manual block) -> 'blocked' — không cho check-in qua board
 * 2. booking đang checked-in       -> 'occupied'
 * 3. housekeeping dirty/cleaning   -> 'cleaning'
 * 4. housekeeping out_of_order     -> 'out_of_order' (gộp nhóm "đang dọn", màu khác — theo brain.decisions)
 * 5. còn lại (housekeeping clean, không ai ở) -> 'vacant' — bao gồm cả booking 'booked' hôm nay chưa check-in
 */
export function getRoomBoardState(room: DashboardRoom): RoomBoardState {
  if (room.is_blocked) {
    return 'blocked'
  }

  if (room.status === 'checked-in') {
    return 'occupied'
  }

  if (room.housekeeping_status === 'dirty' || room.housekeeping_status === 'cleaning') {
    return 'cleaning'
  }

  if (room.housekeeping_status === 'out_of_order') {
    return 'out_of_order'
  }

  return 'vacant'
}
```

---

## File 3 — `src/features/dashboard/components/RoomBoard.module.css` (file mới)

```css
/* FILE: src/features/dashboard/components/RoomBoard.module.css */
.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--rule);
  margin-bottom: var(--space-4);
}

.summaryCell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  padding: var(--space-3) var(--space-2);
}

.summaryNum {
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: 1.1;
}

.summaryLabel {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: 2px;
}

.board {
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* ĐÃ SỬA: 5 track -> 6 track, thêm 110px cho cột Action (bug v1 đã fix). */
.row {
  display: grid;
  grid-template-columns: 56px 1fr minmax(80px, 120px) 130px 150px 110px;
  align-items: center;
  height: var(--row-height);
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--rule);
  font-size: var(--text-base);
  gap: var(--space-2);
}

.row:last-child {
  border-bottom: none;
}

.head {
  height: auto;
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: var(--surface-subtle);
}

.id {
  font-weight: 600;
}

.type {
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.guest {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.guestEmpty {
  color: var(--text-muted);
}

.price {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  white-space: nowrap;
}

.dotGo { color: var(--signal-go); }
.dotHold { color: var(--signal-hold); }
.dotOcc { color: var(--signal-occupied); }
.dotStop { color: var(--signal-stop); }

/* ĐÃ SỬA: debtBadge giờ là <button> thật (bấm mở PaymentModal), không còn là <span> tĩnh. */
.debtBadge {
  color: var(--signal-stop);
  font-size: var(--text-xs);
  cursor: pointer;
  border: none;
  background: none;
  padding: 0;
}

.action {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .row {
    grid-template-columns: 48px 1fr 110px;
    height: auto;
    padding: var(--space-2) var(--space-3);
    row-gap: 4px;
  }
  .type,
  .price {
    display: none;
  }
  .status {
    grid-column: 1 / -1;
    justify-content: flex-start;
    order: 3;
  }
  .action {
    grid-column: 1 / -1;
    justify-content: flex-start;
    margin-top: 4px;
    order: 4;
  }
}
```

---

## File 4 — `src/features/dashboard/components/RoomBoard.tsx` (file mới)

```tsx
// FILE: src/features/dashboard/components/RoomBoard.tsx
import { Button, Tooltip } from 'antd'
import type { DashboardRoom } from '@/types/dashboard'
import { getRoomBoardState, type RoomBoardState } from '@/features/dashboard/utils/roomBoardState'
import { useMarkRoomClean } from '@/features/housekeeping/hooks/useMarkRoomClean'
import styles from './RoomBoard.module.css'

interface RoomBoardProps {
  rooms: DashboardRoom[]
  onCheckinClick: (room: DashboardRoom) => void
  onCheckoutClick: (room: DashboardRoom) => void
  onDetailsClick: (room: DashboardRoom) => void
  onPaymentClick: (room: DashboardRoom) => void
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('vi-VN').format(value)
}

// View dashboard_today có thể trả nhiều dòng/phòng (vừa checked-in vừa có booking 'booked'
// sắp tới trùng ngày). Gộp về 1 dòng/phòng — ưu tiên checked-in > còn lại.
function dedupeRooms(rooms: DashboardRoom[]): DashboardRoom[] {
  const byRoom = new Map<string, DashboardRoom>()

  for (const room of rooms) {
    const existing = byRoom.get(room.room_id)
    if (!existing) {
      byRoom.set(room.room_id, room)
      continue
    }
    // Ưu tiên dòng checked-in; nếu existing chưa phải checked-in mà room là checked-in thì thay.
    if (existing.status !== 'checked-in' && room.status === 'checked-in') {
      byRoom.set(room.room_id, room)
    }
  }

  return Array.from(byRoom.values())
}

// Cột "Khách" — tuỳ trạng thái mà hiện tên khách, gợi ý sắp đến, hay lý do trống/dọn.
function renderGuestCell(room: DashboardRoom, state: RoomBoardState): React.ReactNode {
  if (state === 'occupied') {
    return room.guest_name ?? '—'
  }

  if (state === 'vacant' && room.status === 'booked') {
    return (
      <span>
        {room.guest_name ?? '—'} <span className={styles.guestEmpty}>(sắp đến)</span>
      </span>
    )
  }

  if (state === 'cleaning') {
    return <span className={styles.guestEmpty}>Vừa trả phòng</span>
  }

  if (state === 'out_of_order') {
    return <span className={styles.guestEmpty}>{room.housekeeping_note ?? 'Đang xử lý'}</span>
  }

  if (state === 'blocked') {
    return <span className={styles.guestEmpty}>{room.block_reason ?? 'Đang đóng'}</span>
  }

  return <span className={styles.guestEmpty}>—</span>
}

// Room Board — bảng vận hành theo thiết kế "Bảng điều khiển sân bay" đã duyệt.
export function RoomBoard({
  rooms,
  onCheckinClick,
  onCheckoutClick,
  onDetailsClick,
  onPaymentClick,
}: RoomBoardProps): React.JSX.Element {
  const markClean = useMarkRoomClean()
  const boardRooms = dedupeRooms(rooms)

  const counts = boardRooms.reduce(
    (acc, room) => {
      acc[getRoomBoardState(room)] += 1
      return acc
    },
    { blocked: 0, occupied: 0, cleaning: 0, out_of_order: 0, vacant: 0 } as Record<RoomBoardState, number>,
  )

  return (
    <div>
      <div className={styles.summary}>
        <div className={styles.summaryCell}>
          <span className={styles.summaryNum} style={{ color: 'var(--signal-go)' }}>
            {counts.vacant}
          </span>
          <span className={styles.summaryLabel}>Trống</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryNum} style={{ color: 'var(--signal-occupied)' }}>
            {counts.occupied}
          </span>
          <span className={styles.summaryLabel}>Đang ở</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryNum} style={{ color: 'var(--signal-hold)' }}>
            {counts.cleaning + counts.out_of_order}
          </span>
          <span className={styles.summaryLabel}>Đang dọn</span>
        </div>
      </div>

      <div className={styles.board}>
        {/* ĐÃ SỬA: thêm <span /> trống thứ 6 khớp track action (bug v1 đã fix). */}
        <div className={`${styles.row} ${styles.head}`}>
          <span>Phòng</span>
          <span>Loại</span>
          <span>Khách</span>
          <span style={{ textAlign: 'right' }}>Giá/đêm</span>
          <span style={{ textAlign: 'right' }}>Trạng thái</span>
          <span />
        </div>

        {boardRooms.map((room) => {
          const state = getRoomBoardState(room)
          const isMarkingThisRoom = markClean.isPending && markClean.variables?.roomId === room.room_id

          return (
            <div key={room.room_id} className={styles.row}>
              <span className={styles.id}>{room.room_id}</span>
              <span className={styles.type}>{room.room_type}</span>
              <span className={styles.guest}>{renderGuestCell(room, state)}</span>
              <span className={styles.price}>{formatCurrency(room.price_per_night)}</span>

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

              <span className={styles.action}>
                {state === 'vacant' && (
                  <Button size="small" type="primary" onClick={() => onCheckinClick(room)}>
                    Nhận phòng
                  </Button>
                )}
                {state === 'occupied' && (
                  <Button size="small" onClick={() => onCheckoutClick(room)}>
                    Trả phòng
                  </Button>
                )}
                {state === 'cleaning' && (
                  <Button
                    size="small"
                    loading={isMarkingThisRoom}
                    onClick={() => markClean.mutate({ roomId: room.room_id })}
                  >
                    Đã dọn xong
                  </Button>
                )}
                {state === 'out_of_order' && (
                  <Tooltip title="Phòng đang hỏng/khóa — chưa có nút đổi trạng thái trên Dashboard, cập nhật qua Telegram bot hoặc Notion">
                    <Button size="small" disabled>
                      Chi tiết
                    </Button>
                  </Tooltip>
                )}
                {state === 'blocked' && (
                  <Button size="small" onClick={() => onDetailsClick(room)}>
                    Chi tiết
                  </Button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

## File 5 — `src/features/dashboard/pages/DashboardPage.tsx` (patch — surgical, không viết lại cả file)

**Bước 1 — Xoá `StatsBar` (số liệu lệch nhau, gây hiểu nhầm với Room Board):**

```tsx
// TÌM và XOÁ dòng:
      <StatsBar stats={stats} />
```

Nếu sau khi xoá dòng render mà import `StatsBar` hoặc biến `stats` báo unused (không còn dùng ở đâu khác trong file), xoá luôn cả import và biến đó. Nếu `stats` vẫn được dùng ở chỗ khác trong file, giữ nguyên.

**Bước 2 — Thay `RoomCard` grid bằng `RoomBoard`, nối `onPaymentClick`:**

```tsx
// TÌM (cấu trúc cũ dùng Row/Col render từng RoomCard, hoặc RoomBoard chưa có onPaymentClick):
        <RoomBoard
          rooms={rooms}
          onCheckinClick={handleRoomClick}
          onCheckoutClick={handleRoomClick}
          onDetailsClick={handleDetailsClick}
        />

// THAY BẰNG (thêm onPaymentClick — bắt buộc, nếu thiếu sẽ runtime error vì prop required):
        <RoomBoard
          rooms={rooms}
          onCheckinClick={handleRoomClick}
          onCheckoutClick={handleRoomClick}
          onDetailsClick={handleDetailsClick}
          onPaymentClick={handlePaymentClick}
        />
```

> Nếu `DashboardPage.tsx` hiện tại đang render `RoomCard` trong `Row`/`Col` (bản gốc trước khi có Room Board), thay thế toàn bộ block `<Row gutter={...}><Col ...><RoomCard ... /></Col></Row>` bằng `<RoomBoard ... />` như trên. Đồng thời xoá import `Row`, `Col`, `RoomCard` nếu không còn dùng ở chỗ khác trong file. `handlePaymentClick` đã tồn tại sẵn trong file (dùng cho `PaymentModal`) — chỉ cần nối thêm prop, không cần viết hàm mới.

---

## Checklist verify sau khi áp xong (Claude Code CLI tự chạy)

1. `tsc --noEmit` — 0 lỗi trên các file đã sửa.
2. `eslint` — 0 lỗi mới trên các file đã sửa (lỗi pre-existing ngoài scope thì bỏ qua).
3. `npm run build` — pass.
4. Báo lại danh sách file đã đổi + xác nhận `RoomBoard.module.css` có đúng 6 track trong `.row` (không phải 5).
5. **Không tự ý bỏ qua bước test tay trên live** — sau khi deploy, nhắc Hiếu mở `pms.hellodalathostel.com` kiểm tra trực quan trước khi coi là xong, đặc biệt: cột action không lệch, debt dot bấm mở được PaymentModal, phòng 202 (hoặc phòng nào có cả checked-in + booked trùng ngày) không hiện lặp dòng.