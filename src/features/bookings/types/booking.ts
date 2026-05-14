export interface CreateGroupBookingInput {
  customer_name: string
  customer_phone: string
  room_category: 'dorm' | 'private' | 'mixed'
  room_quantity: number
  guest_count: number
  checkin_date: string
  checkout_date: string
  note?: string
}

export interface CreateGroupBookingResult {
  booking_id: string
  code: string
}

// Item dịch vụ trong form, gắn theo index booking (0-based).
export interface ServiceLineItem {
  service_id: string
  name: string
  price: number
  qty: number
  booking_index: number
}

// Item giảm giá trong form, gắn theo index booking (0-based).
export interface DiscountLineItem {
  amount: number
  description: string
  booking_index: number
}

// Dữ liệu đặt cọc, ghi nhận sau khi tạo booking thành công.
export interface DepositInput {
  amount: number
  method: 'cash' | 'transfer' | 'card' | 'other'
  note?: string
}
