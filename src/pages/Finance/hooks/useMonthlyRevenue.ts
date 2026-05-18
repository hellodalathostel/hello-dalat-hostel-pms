import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { GroupRevenueSummary, MonthlyRevenueSummary } from '../types'

// Kiểu row trả về từ view finance_monthly_revenue
interface FinanceMonthlyRow {
  group_id: string
  customer_name: string
  source: string | null
  net_revenue: number
  paid: number
  channel_fee_rate: number
  service_revenue: number
  booking_count: number
  check_in: string
  check_out: string
}

async function fetchMonthlyRevenue(month: dayjs.Dayjs): Promise<MonthlyRevenueSummary> {
  const startOfMonth = month.startOf('month').format('YYYY-MM-DD')
  const endOfMonth = month.add(1, 'month').startOf('month').format('YYYY-MM-DD')

  // Query 1: dùng view finance_monthly_revenue — filter check_out đúng level
  const { data: rawGroups, error: groupsError } = await supabase
    .from('finance_monthly_revenue')
    .select('*')
    .gte('check_out', startOfMonth)
    .lt('check_out', endOfMonth)

  if (groupsError) throw normalizeError(groupsError)

  // Query 2: revenue_manual_log cùng tháng
  const { data: manualData, error: manualError } = await supabase
    .from('revenue_manual_log')
    .select('amount')
    .gte('period', startOfMonth)
    .lt('period', endOfMonth)

  if (manualError) {
    throw normalizeError(manualError)
  }

  // Map trực tiếp từ view — không cần tính toán thêm
  const groups: GroupRevenueSummary[] = ((rawGroups ?? []) as FinanceMonthlyRow[]).map((g) => ({
    group_id: g.group_id,
    customer_name: g.customer_name,
    source: g.source,
    net_revenue: g.net_revenue ?? 0,
    paid: g.paid ?? 0,
    channel_fee_rate: g.channel_fee_rate ?? 0,
    service_revenue: g.service_revenue ?? 0,
    booking_count: g.booking_count ?? 1,
    check_in: g.check_in ?? '',
    check_out: g.check_out ?? '',
  }))

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
