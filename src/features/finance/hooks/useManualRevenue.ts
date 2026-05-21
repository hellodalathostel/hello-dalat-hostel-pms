import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'

export type ManualRevenueSource = 'room_cash' | 'service' | 'other'

export interface ManualRevenueRow {
  id: string
  period: string
  source: ManualRevenueSource
  amount: number
  note: string | null
  created_at: string
}

export interface CreateManualRevenuePayload {
  period: string
  source: ManualRevenueSource
  amount: number
  note?: string
}

export const SOURCE_LABELS: Record<ManualRevenueSource, string> = {
  room_cash: 'Thu phòng (tiền mặt)',
  service: 'Dịch vụ',
  other: 'Khác',
}

export function useManualRevenueList(month?: string) {
  return useQuery({
    queryKey: ['manual-revenue', month],
    queryFn: async () => {
      let query = supabase
        .from('revenue_manual_log')
        .select('*')
        .order('period', { ascending: false })

      if (month) {
        const from = `${month}-01`
        const to = `${month}-31`
        query = query.gte('period', from).lte('period', to)
      }

      const { data, error } = await query
      if (error) throw normalizeError(error)
      return data as ManualRevenueRow[]
    },
  })
}

export function useCreateManualRevenue() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: CreateManualRevenuePayload) => {
      const { data, error } = await supabase.rpc('create_manual_revenue_txn', {
        p_period: payload.period,
        p_source: payload.source,
        p_amount: payload.amount,
        p_note: payload.note ?? null,
      })

      if (error) throw normalizeError(error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual-revenue'] })
    },
    onError: (error: unknown) => {
      console.error('[useCreateManualRevenue]', normalizeError(error))
    },
  })
}