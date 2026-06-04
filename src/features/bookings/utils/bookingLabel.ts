import dayjs from 'dayjs'
import type { BookingStatus } from '@/features/bookings/types'

// Trả về label hiển thị theo trạng thái booking; status là nguồn sự thật.
export function getBookingStatusLabel(status: BookingStatus, checkIn: string): string {
  switch (status) {
    case 'checked-out':
      return 'Đã trả phòng'
    case 'checked-in':
      return 'Đang ở'
    case 'cancelled':
      return 'Đã hủy'
    case 'booked':
      return dayjs().isBefore(dayjs(checkIn), 'day') ? 'Sắp đến' : 'Chưa nhận phòng'
    default:
      return status
  }
}
