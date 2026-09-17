import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import type { Holiday } from '@/types/holiday'

// Hook lấy toàn bộ danh sách ngày lễ/nghỉ bù — data nhỏ, ít đổi, cache dài
// (staleTime 1 giờ) để tránh query lại mỗi lần đổi khoảng ngày trên tab Lịch.
export function useHolidays() {
  return useQuery({
    queryKey: ['holidays'],
    queryFn: async (): Promise<Holiday[]> => {
      const { data, error } = await supabase
        .from('holidays')
        .select('date, name, is_makeup_day, note')
        .order('date')

      if (error) {
        throw error
      }

      return data ?? []
    },
    staleTime: 60 * 60 * 1000, // 1 giờ
  })
}

// Helper: build Map<date, Holiday> để lookup O(1) khi render lưới ngày trên calendar
export function useHolidayMap(): Map<string, Holiday> {
  const { data } = useHolidays()

  return useMemo(() => {
    const map = new Map<string, Holiday>()
    for (const h of data ?? []) {
      map.set(h.date, h)
    }
    return map
  }, [data])
}
