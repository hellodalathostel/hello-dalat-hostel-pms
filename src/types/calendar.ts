import type { HousekeepingStatus } from './database'

// Dữ liệu một ô lịch lấy từ view room_calendar.
export interface CalendarEvent {
  room_id: string
  room_name: string | null
  date: string
  booking_id: string | null
  code: string | null
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

// Một khối liên tục (booking/block) đã gộp nhiều ngày liên tiếp, dùng để render
// absolute-positioned div trên lưới calendar. Thay thế cơ chế colSpan cũ.
export interface RoomBlock {
  /** Event đại diện cho khối (event của ngày đầu tiên trong khối) */
  event: CalendarEvent
  variant: 'blocked' | 'booked' | 'checked-in' | 'checked-out' | 'cancelled'
  /** Index ngày bắt đầu, tính từ ngày đầu khung nhìn (luôn trong [0, dates.length)) */
  rawStart: number
  /** Index ngày kết thúc (exclusive), có thể > dates.length nếu bị clip ở hook */
  rawEnd: number
  shortLabel: string
}

// Một hàng phòng đã được chuẩn hóa để render lên timeline.
export interface RoomRow {
  room_id: string
  room_name: string
  housekeeping_status: HousekeepingStatus
  housekeeping_note: string | null
  /** Danh sách khối booking/block liên tục — dùng để render absolute block */
  blocks: RoomBlock[]
}