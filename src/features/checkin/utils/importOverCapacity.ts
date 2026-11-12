import { isOverCapacity } from '@/shared/utils/overCapacity'
import type { GuestImportRow } from './parseCheckinExcel'

export interface OverCapacityGroup {
  roomId: string
  checkInDate: string
  guests: number
  capacity: number
}

// Đếm số khách theo (phòng, ngày đến) rồi so với sức chứa.
// `rows` phải là các dòng đã qua kiểm tra hợp lệ (cùng điều kiện với luồng import).
export function computeOverCapacityGroups(
  rows: Pick<GuestImportRow, 'roomId' | 'checkInDate'>[],
  capacityByRoom: Record<string, number>,
): OverCapacityGroup[] {
  const groups = new Map<string, OverCapacityGroup>()

  for (const row of rows) {
    if (!row.roomId || !row.checkInDate) continue

    const capacity = capacityByRoom[row.roomId]
    if (capacity == null) continue

    const key = `${row.roomId}__${row.checkInDate}`
    const current = groups.get(key)

    if (current) {
      current.guests += 1
    } else {
      groups.set(key, {
        roomId: row.roomId,
        checkInDate: row.checkInDate,
        guests: 1,
        capacity,
      })
    }
  }

  return [...groups.values()].filter((group) => isOverCapacity(group.guests, group.capacity))
}
