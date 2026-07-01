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
