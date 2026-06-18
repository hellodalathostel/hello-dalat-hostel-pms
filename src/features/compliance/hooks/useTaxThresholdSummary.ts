import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'

export interface TaxThresholdMonthRow {
  thang: number
  doanh_thu: number
}

export interface TaxThresholdSummary {
  year: number
  pms_actual: number
  pms_future_booked: number
  manual_total: number
  total_actual: number
  threshold: number
  percent_of_threshold: number
  remaining_to_threshold: number
  status: 'green' | 'yellow' | 'red'
  forecast_total: number
  forecast_exceeds_threshold: boolean
  is_current_year: boolean
  by_month: TaxThresholdMonthRow[]
}

// Hook lấy tổng quan ngưỡng thuế 1 tỷ (Nghị định 141/2026, Nhóm I).
// Gọi RPC get_tax_threshold_summary — merge v_s1a_hkd (thực tế, ngay_ghi_so <= hôm nay)
// + revenue_manual_log. KHÔNG dùng pms_future_booked để tính ngưỡng/dự báo.
export function useTaxThresholdSummary(year: number) {
  return useQuery<TaxThresholdSummary>({
    queryKey: ['tax-threshold-summary', year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_tax_threshold_summary', {
        p_year: year,
      })

      if (error) throw error
      return data as TaxThresholdSummary
    },
    staleTime: 5 * 60 * 1000,
  })
}
