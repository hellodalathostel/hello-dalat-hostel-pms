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
 *
 * State này quyết định NÚT HÀNH ĐỘNG trên board — không đổi. Phân nhóm cho chỉ số đếm
 * dùng getRoomBoardGroup bên dưới.
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

/**
 * Nhóm cho chỉ số đếm đầu Room Board (F03) — mỗi phòng thuộc đúng MỘT nhóm:
 * - 'awaiting_arrival': phòng sạch, có booking 'booked' trong view dashboard_today
 *                       (check_in <= hôm nay <= check_out — gồm cả khách đến trễ chưa nhận)
 * - 'no_guest_today':   phòng sạch, không có khách hôm nay. Room Board chỉ biết booking giao
 *                       với hôm nay (view dashboard_today: check_in <= hôm nay <= check_out), nên
 *                       nhóm này nghĩa là "không có khách hôm nay", KHÔNG có nghĩa phòng không có
 *                       đặt trước cho các ngày sau.
 * - 'occupied' / 'checkout_today': giữ nguyên nghĩa cũ
 * - 'needs_cleaning':   housekeeping dirty hoặc cleaning (KHÔNG gồm out_of_order)
 * - 'unavailable':      out_of_order hoặc đang bị block (room_blocks / OTA block)
 *
 * KHÔNG có nhóm "Trống"/"Còn bán": board chỉ nhìn ngày hôm nay, chưa đủ cơ sở kết luận còn bán.
 */
export type RoomBoardGroup =
  | 'awaiting_arrival'
  | 'no_guest_today'
  | 'occupied'
  | 'checkout_today'
  | 'needs_cleaning'
  | 'unavailable'

export const ROOM_BOARD_GROUP_ORDER: readonly RoomBoardGroup[] = [
  'awaiting_arrival',
  'no_guest_today',
  'occupied',
  'checkout_today',
  'needs_cleaning',
  'unavailable',
]

export const ROOM_BOARD_GROUP_LABEL: Record<RoomBoardGroup, string> = {
  awaiting_arrival: 'Chờ nhận',
  no_guest_today: 'Chưa có khách hôm nay',
  occupied: 'Đang ở',
  checkout_today: 'Trả hôm nay',
  needs_cleaning: 'Cần dọn / Đang dọn',
  unavailable: 'Hỏng / Khóa',
}

export function getRoomBoardGroup(room: DashboardRoom): RoomBoardGroup {
  const state = getRoomBoardState(room)

  switch (state) {
    case 'blocked':
    case 'out_of_order':
      return 'unavailable'
    case 'cleaning':
      return 'needs_cleaning'
    case 'occupied':
      return 'occupied'
    case 'checkout_today':
      return 'checkout_today'
    case 'vacant':
      // View chỉ trả booking 'booked' | 'checked-in' giao với hôm nay; checked-in đã rơi vào nhánh
      // trên. Booking ngày mai trở đi không có trong view → vẫn là 'no_guest_today'.
      return room.status === 'booked' ? 'awaiting_arrival' : 'no_guest_today'
  }
}

// View dashboard_today có thể trả nhiều dòng/phòng (vừa checked-in vừa có booking 'booked'
// sắp tới trùng ngày). Gộp về 1 dòng/phòng — ưu tiên checked-in > còn lại.
export function dedupeRooms(rooms: DashboardRoom[]): DashboardRoom[] {
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

// Đếm số phòng theo nhóm — tự gộp dòng trùng trước, nên tổng các nhóm luôn = số phòng duy nhất.
export function countRoomBoardGroups(rooms: DashboardRoom[]): Record<RoomBoardGroup, number> {
  const counts: Record<RoomBoardGroup, number> = {
    awaiting_arrival: 0,
    no_guest_today: 0,
    occupied: 0,
    checkout_today: 0,
    needs_cleaning: 0,
    unavailable: 0,
  }

  for (const room of dedupeRooms(rooms)) {
    counts[getRoomBoardGroup(room)] += 1
  }

  return counts
}
