// Rule 1 (29/10/2026): vượt sức chứa phòng → cảnh báo + xác nhận rồi vẫn cho lưu (chỉ kiểm tra ở frontend).

export const OVER_CAPACITY_NOTE = '[vượt sức chứa, đã xác nhận]'

export function isOverCapacity(guests: number | null | undefined, capacity: number | null | undefined): boolean {
  return guests != null && capacity != null && capacity > 0 && guests > capacity
}

export function overCapacityMessage(guests: number, capacity: number): string {
  return `Số khách (${guests}) vượt sức chứa phòng (${capacity}). Vẫn lưu?`
}

// Nối dòng đánh dấu vào note hiện có — không ghi đè, không thêm trùng.
export function appendOverCapacityNote(note: string | null | undefined): string {
  const current = note ?? ''
  if (current.includes(OVER_CAPACITY_NOTE)) return current
  return current.trim() ? `${current}\n${OVER_CAPACITY_NOTE}` : OVER_CAPACITY_NOTE
}
