import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { UnpaidGroup } from '../types'
import { computeUnpaidGroups, type RawGroupWithBookings } from '../utils/unpaidDebt'

async function fetchUnpaidBookings(): Promise<UnpaidGroup[]> {
  const { data, error } = await supabase
    .from('groups')
    .select(
      `
      id,
      customer_name,
      source,
      grand_total,
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

  // Lọc phía client: groups đã check-out nhưng paid < grand_total (nợ thật của khách).
  // KHÔNG so với net_revenue — đó là doanh thu sau phí kênh, không phải số khách phải trả.
  const rawGroups = (data ?? []) as RawGroupWithBookings[]

  return computeUnpaidGroups(rawGroups)
}

export function useUnpaidBookings() {
  return useQuery({
    queryKey: ['finance', 'unpaid-bookings'],
    queryFn: fetchUnpaidBookings,
    staleTime: 2 * 60 * 1000,
  })
}
