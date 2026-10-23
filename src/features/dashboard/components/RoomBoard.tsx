// FILE: src/features/dashboard/components/RoomBoard.tsx
import { Button, Tooltip } from 'antd'
import { MoreOutlined } from '@ant-design/icons'
import type { DashboardRoom } from '@/types/dashboard'
import {
  ROOM_BOARD_GROUP_LABEL,
  ROOM_BOARD_GROUP_ORDER,
  countRoomBoardGroups,
  dedupeRooms,
  getRoomBoardState,
  isOccupiedLikeState,
  type RoomBoardGroup,
  type RoomBoardState,
} from '@/features/dashboard/utils/roomBoardState'
import { useMarkRoomClean } from '@/features/housekeeping/hooks/useMarkRoomClean'
import { formatMoney } from '@/shared/utils/format'
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

// Màu số đếm theo nhóm — token signal trên --surface. Riêng --signal-checkout (giữ màu cũ của
// "Trả hôm nay") chỉ 4.09:1 ở light mode; số 20px/600 nên vẫn đạt ngưỡng chữ lớn 3:1.
const GROUP_COLOR: Record<RoomBoardGroup, string> = {
  awaiting_arrival: 'var(--ink)',
  no_guest_today: 'var(--signal-go)',
  occupied: 'var(--signal-occupied)',
  checkout_today: 'var(--signal-checkout)',
  needs_cleaning: 'var(--signal-hold)',
  unavailable: 'var(--signal-stop)',
}

// F08: nhãn nợ hiển thị bằng chữ (không cần hover). Số tiền = group_balance_due từ view
// (groups.grand_total − groups.paid) — số dư CẤP ĐOÀN, không tự tính từ booking.
// Đoàn còn >1 booking active → ghi rõ "Nợ đoàn" để không ai cộng các dòng phòng lại thành tổng nợ.
function getDebtLabel(room: DashboardRoom): string | null {
  const balance = room.group_balance_due ?? 0
  if (balance <= 0) return null
  const isMultiRoomGroup = (room.group_active_booking_count ?? 0) > 1
  return `${isMultiRoomGroup ? 'Nợ đoàn' : 'Nợ'} ${formatMoney(balance)}`
}

// Cột "Khách" — tuỳ trạng thái mà hiện tên khách, gợi ý sắp đến, hay lý do trống/dọn.
function renderGuestCell(room: DashboardRoom, state: RoomBoardState): React.ReactNode {
  if (isOccupiedLikeState(state)) {
    return <span className={styles.guestName}>{room.guest_name ?? '—'}</span>
  }

  if (state === 'vacant' && room.status === 'booked') {
    return (
      <span>
        <span className={styles.guestName}>{room.guest_name ?? '—'}</span>{' '}
        <span className={styles.guestHint}>(sắp đến)</span>
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

  // F03: đếm qua hàm thuần (đã test) — mỗi phòng đúng một nhóm, không còn "Trống".
  const counts = countRoomBoardGroups(rooms)

  return (
    <div>
      <div className={styles.summary}>
        {ROOM_BOARD_GROUP_ORDER.map((group) => (
          <div key={group} className={styles.summaryCell}>
            <span className={styles.summaryNum} style={{ color: GROUP_COLOR[group] }}>
              {counts[group]}
            </span>
            <span className={styles.summaryLabel}>{ROOM_BOARD_GROUP_LABEL[group]}</span>
          </div>
        ))}
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
          const debtLabel = getDebtLabel(room)

          // Tô màu cả dòng theo trạng thái — phòng chưa có khách ở giữ nguyên, không thêm class
          const rowStateClass =
            state === 'occupied'
              ? styles.rowOccupied
              : state === 'checkout_today'
                ? styles.rowCheckoutToday
                : ''

          return (
            <div key={room.room_id} className={`${styles.row} ${rowStateClass}`}>
              <span className={styles.id}>{room.room_id}</span>
              <span className={styles.guest}>{renderGuestCell(room, state)}</span>
              <span className={styles.price}>{formatCurrency(room.price_per_night)}</span>

              <span className={styles.status}>
                {state === 'vacant' && room.status === 'booked' && (
                  <span className={styles.dotAwaiting}>○ CHỜ NHẬN</span>
                )}
                {state === 'vacant' && room.status !== 'booked' && (
                  <span className={styles.dotGo}>○ CHƯA CÓ KHÁCH</span>
                )}
                {isOccupiedLikeState(state) && (
                  <>
                    {state === 'occupied' && <span className={styles.dotOcc}>● ĐANG Ở</span>}
                    {state === 'checkout_today' && (
                      <span className={styles.dotCheckout}>● TRẢ HÔM NAY</span>
                    )}
                    {/* F08: nhãn nợ bằng chữ, bấm mở PaymentModal; tooltip chỉ là phần bổ sung. */}
                    {debtLabel && (
                      <Tooltip title="Số dư cấp đoàn — bấm để thu tiền">
                        <button
                          type="button"
                          className={styles.debtBadge}
                          onClick={() => onPaymentClick(room)}
                          aria-label={`${debtLabel} — thu tiền phòng ${room.room_id}`}
                        >
                          {debtLabel}
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
                  <Button type="primary" onClick={() => onCheckinClick(room)}>
                    {room.booking_id ? 'Nhận phòng' : 'Đặt phòng'}
                  </Button>
                )}
                {isOccupiedLikeState(state) && (
                  <Button onClick={() => onCheckoutClick(room)}>
                    Trả phòng
                  </Button>
                )}
                {state === 'cleaning' && (
                  <Button
                    loading={isMarkingThisRoom}
                    onClick={() => markClean.mutate({ roomId: room.room_id })}
                  >
                    Đã dọn xong
                  </Button>
                )}
                {state === 'out_of_order' && (
                  <Tooltip title="Phòng đang hỏng/khóa — chưa có nút đổi trạng thái trên Dashboard, cập nhật qua Telegram bot hoặc Notion">
                    <Button disabled>
                      Chi tiết
                    </Button>
                  </Tooltip>
                )}
                {state === 'blocked' && (
                  <Button onClick={() => onDetailsClick(room)}>
                    Chi tiết
                  </Button>
                )}
                {(state === 'vacant' || isOccupiedLikeState(state) || state === 'cleaning') && room.booking_id && (
                  <Button
                    icon={<MoreOutlined />}
                    onClick={() => onDetailsClick(room)}
                    aria-label={`Thao tác khác — phòng ${room.room_id}`}
                    title="Thao tác khác"
                    className={styles.iconBtn}
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
