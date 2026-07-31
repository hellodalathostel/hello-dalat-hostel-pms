import type { NewBookingFormValues } from '@/lib/schemas'

export const CHANNEL_FEE_RATE: Record<NewBookingFormValues['source'], number> = {
  'Booking.com': 0.15,
  Facebook: 0,
  'Gọi điện/Zalo': 0,
  'Khách quen': 0,
  'Walk-in': 0,
  Other: 0,
}
