// Hook fetch danh sách phòng từ DB — dùng cho Calendar, Dashboard, v.v.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'

export interface Room {
  id: string
  name: string
  type: string
  floor: number
  capacity: number
  is_active: boolean
}

export function useRooms(onlyActive = true) {
  return useQuery<Room[]>({
    queryKey: ['rooms', { onlyActive }],
    queryFn: async () => {
      let query = supabase
        .from('rooms')
        .select('id, name, type, floor, capacity, is_active')
        .order('floor', { ascending: true })
        .order('id', { ascending: true })

      if (onlyActive) query = query.eq('is_active', true)

      const { data, error } = await query
      if (error) throw error
      return data as Room[]
    },
    staleTime: 10 * 60 * 1000, // phòng ít thay đổi, cache 10 phút
  })
}
