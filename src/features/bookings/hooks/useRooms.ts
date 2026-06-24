// Hook fetch danh sách phòng từ DB — dùng cho Calendar, Dashboard, OTA panel, v.v.
// Single source of truth duy nhất cho danh sách rooms trong toàn app (M1 fix).
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import type { Room } from '@/types/room'

export type RoomsQueryItem = Pick<
  Room,
  | 'id'
  | 'name'
  | 'type'
  | 'floor'
  | 'capacity'
  | 'base_price'
  | 'is_active'
  | 'housekeeping_status'
  | 'housekeeping_note'
  | 'ota_feed_url'
  | 'ota_last_synced_at'
>

export function useRooms(onlyActive = true) {
  return useQuery<RoomsQueryItem[]>({
    queryKey: ['rooms', { onlyActive }],
    queryFn: async () => {
      let query = supabase
        .from('rooms')
        .select(
          'id, name, type, floor, capacity, base_price, is_active, housekeeping_status, housekeeping_note, ota_feed_url, ota_last_synced_at',
        )
        .order('floor', { ascending: true })
        .order('id', { ascending: true })

      if (onlyActive) query = query.eq('is_active', true)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as RoomsQueryItem[]
    },
    staleTime: 10 * 60 * 1000, // phòng ít thay đổi, cache 10 phút
  })
}
