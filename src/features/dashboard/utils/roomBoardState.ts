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
