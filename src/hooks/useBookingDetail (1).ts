import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface BookingDetailItem {
  id: string
  room_id: string
  check_in: string
  check_out: string
  nights: number | null
  price: number
  surcharge: number
  grand_total: number | null
  tax_amount: number
  guests_count: number
  guest_name: string | null
  status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled'
  note: string | null
  has_early_check_in: boolean
  has_late_check_out: boolean
  created_at: string
  // Quan hệ join
  services: Array<{
    id: string
    name: string
    price: number
    qty: number
  }>
  discounts: Array<{
    id: string
    amount: number
    description: string | null
  }>
}

export interface GroupDetail {
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
  bookings: BookingDetailItem[]
  payments: Array<{
    id: string
    amount: number
    method: string | null
    date: string
    note: string | null
    created_at: string
  }>
}

async function fetchGroupDetail(groupId: string): Promise<GroupDetail> {
  try {
    // Fetch group
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, customer_name, customer_phone, customer_note, source, channel_fee_rate, ota_booking_number, paid, net_revenue, status, created_at')
      .eq('id', groupId)
      .single()

    if (groupError) throw groupError

    // Fetch bookings kèm services + discounts
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id, room_id, check_in, check_out, nights, price, surcharge, grand_total,
        tax_amount, guests_count, guest_name, status, note,
        has_early_check_in, has_late_check_out, created_at,
        booking_services(id, name, price, qty),
        booking_discounts(id, amount, description)
      `)
      .eq('group_id', groupId)
      .eq('is_deleted', false)
      .order('check_in', { ascending: true })

    if (bookingsError) throw bookingsError

    // Fetch lịch sử thanh toán
    const { data: payments, error: paymentsError } = await supabase
      .from('payment_history')
      .select('id, amount, method, date, note, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })

    if (paymentsError) throw paymentsError

    return {
      ...group,
      bookings: (bookings ?? []).map((b) => ({
        ...b,
        services: b.booking_services ?? [],
        discounts: b.booking_discounts ?? [],
      })),
      payments: payments ?? [],
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

// Hook lấy chi tiết group (bookings + payments + services).
// Dùng cho BookingDetailDrawer và EditBookingModal.
export function useBookingDetail(groupId: string | null) {
  return useQuery({
    queryKey: ['booking-detail', groupId],
    queryFn: () => fetchGroupDetail(groupId!),
    enabled: !!groupId,
    staleTime: 30_000, // 30 giây — detail ít thay đổi hơn calendar
  })
}
