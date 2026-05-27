import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'

// Service/Discount sub-types dùng trong BookingDetailItem
export type BookingServiceItem = { id: string; name: string; price: number; qty: number }
export type BookingDiscountItem = { id: string; amount: number; description: string | null }

// BookingDetailItem mở rộng BookingRow với services và discounts
export type BookingDetailItem = BookingRow & {
  services: BookingServiceItem[]
  discounts: BookingDiscountItem[]
}

export type BookingRow = {
  id: string
  room_id: string
  room_name?: string | null
  check_in: string
  check_out: string
  nights: number | null
  price_per_night: number
  surcharge: number
  grand_total: number | null
  guest_name: string | null
  guests_count: number
  status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled'
  has_early_check_in: boolean
  has_late_check_out: boolean
  note: string | null
  created_at: string
}

export type PaymentRow = {
  id: string
  amount: number
  method: 'cash' | 'transfer' | 'card' | 'other' | null
  date: string
  note: string | null
}

export type GroupDetail = {
  id: string
  customer_name: string
  customer_phone: string | null
  customer_note: string | null
  source: string | null
  channel_fee_rate: number
  ota_booking_number: string | null
  paid: number
  net_revenue: number
  status: string
  created_at: string
  bookings: BookingRow[]
  payments: PaymentRow[]
  grand_total: number
  balance_due: number
}

export async function fetchGroupDetail(groupId: string): Promise<GroupDetail> {
  try {
    const [groupResult, bookingsResult, paymentsResult] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      supabase
        .from('bookings')
        .select('*')
        .eq('group_id', groupId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true }),
      supabase
        .from('payment_history')
        .select('*')
        .eq('group_id', groupId)
        .order('date', { ascending: true }),
    ])

    const { data: group, error: groupError } = groupResult
    const { data: bookings, error: bookingsError } = bookingsResult
    const { data: payments, error: paymentsError } = paymentsResult

    if (groupError) {
      throw groupError
    }

    if (bookingsError) {
      throw bookingsError
    }

    if (paymentsError) {
      throw paymentsError
    }

    const bookingRows = (bookings ?? []) as BookingRow[]
    const paymentRows = (payments ?? []) as PaymentRow[]

    const grandTotal = bookingRows.reduce((sum, booking) => sum + (booking.grand_total ?? 0), 0)
    const paid = group.paid ?? 0
    const balanceDue = grandTotal - paid

    return {
      id: group.id,
      customer_name: group.customer_name,
      customer_phone: group.customer_phone,
      customer_note: group.customer_note,
      source: group.source,
      channel_fee_rate: group.channel_fee_rate,
      ota_booking_number: group.ota_booking_number,
      paid,
      net_revenue: group.net_revenue,
      status: group.status,
      created_at: group.created_at,
      bookings: bookingRows,
      payments: paymentRows,
      grand_total: grandTotal,
      balance_due: balanceDue,
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

export function useBookingDetail(groupId: string | null) {
  return useQuery({
    queryKey: ['booking-detail', groupId],
    queryFn: () => fetchGroupDetail(groupId!),
    enabled: !!groupId,
    staleTime: 30 * 1000,
  })
}
