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
