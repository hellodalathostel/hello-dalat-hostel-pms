import { isOverCapacity } from '@/shared/utils/overCapacity'
import type { GuestImportRow } from './parseCheckinExcel'

export interface OverCapacityGroup {
  roomId: string
  checkInDate: string
  guests: number
  capacity: number
}

export function getImportGroupKey(roomId: string, checkInDate: string): string {
  return `${roomId}__${checkInDate}`
}

// Khoá khách theo giấy tờ — khớp ON CONFLICT (document_type, document_number) của checkin_booking_txn.
export function getGuestDocumentKey(
  documentType: string | null | undefined,
  documentNumber: string | null | undefined,
): string | null {
  return documentType && documentNumber ? `${documentType}|${documentNumber}` : null
}

// Đếm số khách theo (phòng, ngày đến) rồi so với sức chứa.
// `rows` phải là các dòng đã qua kiểm tra hợp lệ (cùng điều kiện với luồng import).
// `existingGuestKeysByGroup`: giấy tờ của khách đã gắn sẵn vào booking đích (import nhiều đợt).
// checkin_booking_txn giữ khách cũ và cộng dồn, nên đếm hợp (cũ ∪ mới), trùng giấy tờ chỉ tính 1.
export function computeOverCapacityGroups(
  rows: (Pick<GuestImportRow, 'roomId' | 'checkInDate'> &
    Partial<Pick<GuestImportRow, 'documentType' | 'documentNumber'>>)[],
  capacityByRoom: Record<string, number>,
  existingGuestKeysByGroup: Record<string, string[]> = {},
): OverCapacityGroup[] {
  const groups = new Map<string, { group: OverCapacityGroup; guestKeys: Set<string> }>()

  rows.forEach((row, index) => {
    if (!row.roomId || !row.checkInDate) return

    const capacity = capacityByRoom[row.roomId]
    if (capacity == null) return

    const key = getImportGroupKey(row.roomId, row.checkInDate)
    let current = groups.get(key)

    if (!current) {
      current = {
        group: { roomId: row.roomId, checkInDate: row.checkInDate, guests: 0, capacity },
        guestKeys: new Set(existingGuestKeysByGroup[key] ?? []),
      }
      groups.set(key, current)
    }

    // Dòng không có giấy tờ: mỗi dòng là một khách riêng.
    current.guestKeys.add(getGuestDocumentKey(row.documentType, row.documentNumber) ?? `row:${index}`)
  })

  return [...groups.values()]
    .map(({ group, guestKeys }) => ({ ...group, guests: guestKeys.size }))
    .filter((group) => isOverCapacity(group.guests, group.capacity))
}
