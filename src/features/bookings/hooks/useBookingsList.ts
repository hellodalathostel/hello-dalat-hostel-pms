import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface BookingsListItem {
  group_id: string
  customer_name: string
  customer_phone: string | null
  source: string
  paid: number
  grand_total: number
  balance_due: number
  earliest_check_in: string
  latest_check_out: string
  rooms: string[]
  statuses: string[]
  created_at: string
}

type GroupBookingRow = {
  id: string
  customer_name: string
  customer_phone: string | null
  source: string | null
  paid: number | null
  created_at: string
  bookings: {
    id: string
    room_id: string
    check_in: string
    check_out: string
    grand_total: number | null
    status: string
    is_deleted: boolean
  }[] | null
}

async function fetchBookingsList(): Promise<BookingsListItem[]> {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select(`
        id,
        customer_name,
        customer_phone,
        source,
        paid,
        created_at,
        bookings (
          id,
          room_id,
          check_in,
          check_out,
          grand_total,
          status,
          is_deleted
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return ((data ?? []) as GroupBookingRow[]).map((group) => {
      const nonDeletedBookings = (group.bookings ?? []).filter((booking) => !booking.is_deleted)
      const activeBookings = nonDeletedBookings.filter((booking) => booking.status !== 'cancelled')
      const grandTotal = activeBookings.reduce((sum, booking) => sum + (booking.grand_total ?? 0), 0)
      const checkIns = activeBookings.map((booking) => booking.check_in).filter(Boolean)
      const checkOuts = activeBookings.map((booking) => booking.check_out).filter(Boolean)

      return {
        group_id: group.id,
        customer_name: group.customer_name,
        customer_phone: group.customer_phone ?? null,
        source: group.source ?? 'walk-in',
        paid: group.paid ?? 0,
        grand_total: grandTotal,
        balance_due: grandTotal - (group.paid ?? 0),
        earliest_check_in: checkIns.sort()[0] ?? '',
        latest_check_out: checkOuts.sort().at(-1) ?? '',
        rooms: [...new Set(activeBookings.map((booking) => booking.room_id))],
        statuses: [...new Set(nonDeletedBookings.map((booking) => booking.status))],
        created_at: group.created_at,
      }
    })
  } catch (error) {
    throw normalizeError(error)
  }
}

export function useBookingsList() {
  return useQuery({
    queryKey: ['bookings-list'],
    queryFn: fetchBookingsList,
    staleTime: 30_000,
  })
}