// Định nghĩa trạng thái hiển thị cho phòng trên dashboard.
export type RoomStatus = 'vacant' | 'arriving' | 'occupied' | 'blocked'

// Đại diện một dòng dữ liệu lấy từ view dashboard_today.
export interface DashboardRoom {
  room_id: string
  room_name: string
  room_type: string
  capacity: number
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
  price: number | null
  grand_total: number | null
  balance_due: number | null
  // Group field
  group_id: string | null
  // Block fields
  is_blocked: boolean
  block_reason: string | null
}

// Số liệu tổng hợp cho thanh thống kê đầu trang.
export interface DashboardStats {
  vacant: number
  arriving: number
  occupied: number
  blocked: number
  debt: number
}
