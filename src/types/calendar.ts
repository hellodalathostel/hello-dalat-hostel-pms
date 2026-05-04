// Dữ liệu một ô lịch lấy từ view room_calendar.
export interface CalendarEvent {
  room_id: string
  room_name: string | null
  date: string
  booking_id: string | null
  block_id: string | null
  entry_type: 'booking' | 'block' | null
  group_id: string | null
  status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled' | null
  is_blocked: boolean
  guest_name: string | null
  guest_phone: string | null
  check_in: string | null
  check_out: string | null
  checkin_at: string | null
  checkout_at: string | null
  grand_total: number | null
  block_reason: string | null
}

// Một hàng phòng đã được chuẩn hóa để render lên timeline.
export interface RoomRow {
  room_id: string
  room_name: string
  days: Array<{
    date: string
    event: CalendarEvent | null
    variant: 'vacant' | 'blocked' | 'booked' | 'checked-in' | 'checked-out' | 'cancelled'
    isVisible: boolean
    colSpan: number
    shortLabel: string
  }>
}