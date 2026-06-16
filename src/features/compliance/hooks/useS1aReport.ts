import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'

export interface S1aRow {
  ngay_ghi_so: string
  dien_giai: string
  so_tien: number
  booking_id: string
  room_id: string
  check_in: string
  source: string
  nam: number
  thang: number
}

export function useS1aReport(nam: number) {
  return useQuery<S1aRow[]>({
    queryKey: ['s1a-report', nam],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_s1a_hkd')
        .select('*')
        .eq('nam', nam)
        .order('ngay_ghi_so', { ascending: true })

      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}
