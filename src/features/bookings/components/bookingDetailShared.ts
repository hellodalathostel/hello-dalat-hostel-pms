// src/features/bookings/components/bookingDetailShared.ts
// Constants/types chung dùng bởi BookingDetailDrawer.tsx và BookingRoomCard.tsx.
// Tách từ BookingDetailDrawer.tsx (M4 — file splitting, không đổi logic).

export type BookingStatus = 'booked' | 'checked-in' | 'checked-out' | 'cancelled'

// Map trạng thái sang màu Ant Design Tag
export const STATUS_COLOR: Record<string, string> = {
  booked: 'blue',
  'checked-in': 'green',
  'checked-out': 'default',
  cancelled: 'red',
}

export const STATUS_LABEL: Record<string, string> = {
  booked: 'Đã đặt',
  'checked-in': 'Đang ở',
  'checked-out': 'Đã trả phòng',
  cancelled: 'Đã huỷ',
}

// PII chỉ hiển thị khi khách đã check-in hoặc đã check-out
export const PII_VISIBLE_STATUSES = ['checked-in', 'checked-out'] as const

export const ACTION_STATUSES = {
  canCheckin: ['booked'] as BookingStatus[],
  canCheckout: ['checked-in'] as BookingStatus[],
  // Dịch vụ và Early/Late cho phép thêm khi booked hoặc checked-in — khớp
  // constraint DB (add_booking_service_txn, add_early_late_txn). Trước đây
  // chỉ cho phép checked-in khiến early check-in không dùng được (vô lý —
  // khách chưa check-in thì mới cần "early check-in").
  canAddService: ['booked', 'checked-in'] as BookingStatus[],
  canEarlyLate: ['booked', 'checked-in'] as BookingStatus[],
  canCancel: ['booked'] as BookingStatus[],
} as const

export function formatVND(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}
