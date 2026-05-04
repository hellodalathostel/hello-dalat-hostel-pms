import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'

export type RevenueRow = {
  month: string
  source: string
  room_id: string
  booking_count: number
  total_nights: number | null
  gross_room_revenue: number | null
  total_tax: number | null
  net_revenue: number | null
  avg_channel_fee_rate: number | null
  confirmed_count: number
  projected_count: number
  confirmed_revenue: number | null
  projected_revenue: number | null
}

// Tổng hợp theo từng tháng để phục vụ dashboard/biểu đồ.
export type MonthSummary = {
  month: string
  total_gross: number
  confirmed_revenue: number
  projected_revenue: number
  net_revenue: number
  booking_count: number
  total_nights: number
  bySource: Record<string, number>
  byRoom: Record<string, number>
}

export async function fetchRevenue(year: number): Promise<RevenueRow[]> {
  try {
    const { data, error } = await supabase
      .from('monthly_revenue')
      .select('*')
      .gte('month', `${year}-01-01`)
      .lte('month', `${year}-12-31`)
      .order('month')

    if (error) {
      throw error
    }

    return (data ?? []) as RevenueRow[]
  } catch (error) {
    throw normalizeError(error)
  }
}

export function aggregateByMonth(rows: RevenueRow[]): MonthSummary[] {
  const grouped = new Map<string, MonthSummary>()

  rows.forEach((row) => {
    const gross = row.gross_room_revenue ?? 0
    const confirmedRevenue = row.confirmed_revenue ?? 0
    const projectedRevenue = row.projected_revenue ?? 0
    const netRevenue = row.net_revenue ?? 0
    const bookingCount = row.booking_count ?? 0
    const totalNights = row.total_nights ?? 0

    if (!grouped.has(row.month)) {
      grouped.set(row.month, {
        month: row.month,
        total_gross: 0,
        confirmed_revenue: 0,
        projected_revenue: 0,
        net_revenue: 0,
        booking_count: 0,
        total_nights: 0,
        bySource: {},
        byRoom: {},
      })
    }

    const summary = grouped.get(row.month)
    if (!summary) {
      return
    }

    summary.total_gross += gross
    summary.confirmed_revenue += confirmedRevenue
    summary.projected_revenue += projectedRevenue
    summary.net_revenue += netRevenue
    summary.booking_count += bookingCount
    summary.total_nights += totalNights
    summary.bySource[row.source] = (summary.bySource[row.source] ?? 0) + gross
    summary.byRoom[row.room_id] = (summary.byRoom[row.room_id] ?? 0) + gross
  })

  return Array.from(grouped.values()).sort((a, b) => a.month.localeCompare(b.month))
}

export function useRevenue(year: number) {
  return useQuery({
    queryKey: ['revenue', year],
    queryFn: () => fetchRevenue(year),
    staleTime: 5 * 60 * 1000,
  })
}
