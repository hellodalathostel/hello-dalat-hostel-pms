// Hook lấy danh sách OTA blocks đang active cho 1 phòng cụ thể
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { supabase } from '@/api/supabase'

export interface OtaBlock {
  id: string
  room_id: string
  ota_source: string
  check_in: string
  check_out: string
  summary: string | null
  status: string | null
  ota_booking_num: string | null
  linked_group_id: string | null
  last_synced_at: string
}

export function useRoomOtaBlocks(roomId: string | null) {
  return useQuery({
    queryKey: ['ota-blocks', roomId],
    queryFn: async (): Promise<OtaBlock[]> => {
      if (!roomId) {
        return []
      }

      const today = dayjs().format('YYYY-MM-DD')

      const { data, error } = await supabase
        .from('ota_calendar_feed')
        .select(
          'id, room_id, ota_source, check_in, check_out, summary, status, ota_booking_num, linked_group_id, last_synced_at',
        )
        .eq('room_id', roomId)
        .gte('check_out', today)
        .order('check_in', { ascending: true })

      if (error) {
        throw error
      }

      return (data ?? []) as OtaBlock[]
    },
    enabled: Boolean(roomId),
    staleTime: 60_000,
  })
}
