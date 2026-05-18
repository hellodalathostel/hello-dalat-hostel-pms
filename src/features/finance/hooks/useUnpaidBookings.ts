import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { UnpaidGroup } from '../types'

interface RawGroupWithBookings {
  id: string
  customer_name: string
  source: string | null
  net_revenue: number
  paid: number
  bookings: { check_out: string }[]
}

async function fetchUnpaidBookings(): Promise<UnpaidGroup[]> {
  const { data, error } = await supabase
    .from('groups')
    .select(
      `
      id,
      customer_name,
      source,
      net_revenue,
      paid,
      bookings!inner(check_out)
    `,
    )
    .eq('bookings.is_deleted', false)
    .eq('bookings.status', 'checked-out')

  if (error) {
    throw normalizeError(error)
  }

  // Lọc phía client: groups đã check-out nhưng paid < net_revenue
  const rawGroups = (data ?? []) as RawGroupWithBookings[]

  return rawGroups
    .filter((g) => (g.paid ?? 0) < (g.net_revenue ?? 0))
    .map((g) => {
      const checkOuts = (g.bookings ?? []).map((b) => b.check_out).filter(Boolean)
      const maxCheckOut = checkOuts.length > 0 ? checkOuts.sort().at(-1)! : ''
      return {
        id: g.id,
        customer_name: g.customer_name,
        source: g.source,
        net_revenue: g.net_revenue ?? 0,
        paid: g.paid ?? 0,
        debt: (g.net_revenue ?? 0) - (g.paid ?? 0),
        check_out: maxCheckOut,
      }
    })
    .sort((a, b) => a.check_out.localeCompare(b.check_out))
}

export function useUnpaidBookings() {
  return useQuery({
    queryKey: ['finance', 'unpaid-bookings'],
    queryFn: fetchUnpaidBookings,
    staleTime: 2 * 60 * 1000,
  })
}
