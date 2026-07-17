import type { HousekeepingStatus } from '@/types/database'

// Định nghĩa trạng thái hiển thị cho phòng trên dashboard.
export type RoomStatus = 'vacant' | 'arriving' | 'occupied' | 'blocked'

// Đại diện một dòng dữ liệu lấy từ view dashboard_today.
export interface DashboardRoom {
  room_id: string
  room_name: string
  room_type: string
  capacity: number
  // Housekeeping — mới thêm cho Room Board
  housekeeping_status: HousekeepingStatus
  housekeeping_note: string | null
  // Booking fields — null nếu phòng trống hoặc bị block
  booking_id: string | null
  check_in: string | null
  check_out: string | null
  status: string | null
  guest_name: string | null
  guests_count: number | null
  customer_phone: string | null
  source: string | null
  paid: number | null
  net_revenue: number | null
  price_per_night: number | null  // đúng tên cột thật trong view, Room Board dùng field này
  grand_total: number | null
  /** LEGACY field — trộn booking-level (grand_total) với group-level (paid): balance_due =
   *  booking.grand_total - group.paid. KHÔNG dùng cho tính toán checkout/payment vì sai khi
   *  group có nhiều phòng. Dùng group_balance_due thay thế. Giữ lại chỉ để tương thích ngược. */
  balance_due: number | null
  // Group field
  group_id: string | null
  // Group-level fields — mới thêm Migration 04b, dùng cho checkout đa phòng
  group_grand_total: number | null
  /** Balance cấp group = group_grand_total - paid. DÙNG FIELD NÀY cho checkout/payment. */
  group_balance_due: number | null
  group_active_booking_count: number | null
  is_last_active_booking: boolean
  // Block fields
  is_blocked: boolean
  block_reason: string | null
}

// Số liệu tổng hợp cho thanh thống kê đầu trang.
export interface DashboardStats {
  vacant: number
  arriving: number
  occupied: number
  checkoutToday: number
  debt: number
}
