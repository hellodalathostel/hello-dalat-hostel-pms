import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { GroupRevenueSummary, MonthlyRevenueSummary } from '../types'

// Kiểu trả về từ Supabase khi query groups với bookings lồng nhau
interface RawBookingService {
  price: number
  qty: number
}

interface RawBooking {
  check_in: string
  check_out: string
  booking_services: RawBookingService[]
}

interface RawGroup {
  id: string
  customer_name: string
  source: string | null
  net_revenue: number
  paid: number
  channel_fee_rate: number
  bookings: RawBooking[]
}

async function fetchMonthlyRevenue(month: dayjs.Dayjs): Promise<MonthlyRevenueSummary> {
  const startOfMonth = month.startOf('month').format('YYYY-MM-DD')
  const endOfMonth = month.add(1, 'month').startOf('month').format('YYYY-MM-DD')

  // Query 1: groups có booking checked-out trong tháng
  const { data: rawGroups, error: groupsError } = await supabase
    .from('groups')
    .select(
      `
      id,
      customer_name,
      source,
      net_revenue,
      paid,
      channel_fee_rate,
      bookings!inner(
        check_in,
        check_out,
        booking_services(price, qty)
      )
    `,
    )
    .eq('bookings.is_deleted', false)
    .eq('bookings.status', 'checked-out')
    .gte('bookings.check_out', startOfMonth)
    .lt('bookings.check_out', endOfMonth)

  if (groupsError) {
    throw normalizeError(groupsError)
  }

  // Query 2: revenue_manual_log cùng tháng
  const { data: manualData, error: manualError } = await supabase
    .from('revenue_manual_log')
    .select('amount')
    .gte('period', startOfMonth)
    .lt('period', endOfMonth)

  if (manualError) {
    throw normalizeError(manualError)
  }

  // Tổng hợp dữ liệu từ raw groups
  const groups: GroupRevenueSummary[] = ((rawGroups ?? []) as RawGroup[]).map((g) => {
    const bookings = g.bookings ?? []
    const checkIns = bookings.map((b) => b.check_in).filter(Boolean)
    const checkOuts = bookings.map((b) => b.check_out).filter(Boolean)

    // Tính service_revenue từ booking_services của tất cả bookings trong group
    const serviceRevenue = bookings.reduce((sum, b) => {
      const bsSum = (b.booking_services ?? []).reduce(
        (s, bs) => s + (bs.price ?? 0) * (bs.qty ?? 1),
        0,
      )
      return sum + bsSum
    }, 0)

    return {
      group_id: g.id,
      customer_name: g.customer_name,
      source: g.source,
      net_revenue: g.net_revenue ?? 0,
      paid: g.paid ?? 0,
      channel_fee_rate: g.channel_fee_rate ?? 0,
      service_revenue: serviceRevenue,
      check_in: checkIns.length > 0 ? checkIns.sort()[0] : '',
      check_out: checkOuts.length > 0 ? checkOuts.sort().at(-1)! : '',
    }
  })

  const manual_revenue = (manualData ?? []).reduce((sum, r) => sum + (r.amount ?? 0), 0)
  const total_net = groups.reduce((sum, g) => sum + g.net_revenue, 0) + manual_revenue
  const total_paid = groups.reduce((sum, g) => sum + g.paid, 0)

  return {
    groups,
    manual_revenue,
    total_net,
    total_paid,
    total_debt: total_net - total_paid,
    booking_count: groups.length,
  }
}

export function useMonthlyRevenue(month: dayjs.Dayjs) {
  const key = month.format('YYYY-MM')
  return useQuery({
    queryKey: ['finance', 'monthly-revenue', key],
    queryFn: () => fetchMonthlyRevenue(month),
    staleTime: 3 * 60 * 1000,
  })
}
