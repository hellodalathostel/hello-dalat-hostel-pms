// FILE: src/features/dashboard/components/RoomBoard.tsx
import { Button, Tooltip } from 'antd'
import { MoreOutlined } from '@ant-design/icons'
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
          <span style={{ textAlign: 'center' }}>Khách</span>
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
                    {room.booking_id ? 'Nhận phòng' : 'Đặt phòng'}
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
                {(state === 'vacant' || state === 'occupied' || state === 'cleaning') && room.booking_id && (
                  <Button
                    size="small"
                    icon={<MoreOutlined />}
                    onClick={() => onDetailsClick(room)}
                  />
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
