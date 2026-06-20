// src/features/ota-calendar/hooks/useOtaCalendar.ts
// Query danh sách OTA events + rooms có feed

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { supabase } from '@/api/supabase'
import { useRooms } from '@/features/bookings/hooks/useRooms'
import type { OtaCalendarEvent, RoomWithFeed } from '../types'

// ─── Query keys ──────────────────────────────────────────────────────────────
export const otaKeys = {
  events: (filters?: { status?: string; room_id?: string }) =>
    ['ota-events', filters] as const,
}

// ─── Lấy danh sách OTA events (có filter) ────────────────────────────────────
export function useOtaEvents(filters?: { status?: OtaCalendarEvent['status']; room_id?: string }) {
  return useQuery({
    queryKey: otaKeys.events(filters),
    queryFn: async () => {
      let q = supabase
        .from('ota_calendar_feed')
        .select('*')
        .order('check_in', { ascending: true })

      if (filters?.status) q = q.eq('status', filters.status)
      if (filters?.room_id) q = q.eq('room_id', filters.room_id)

      const { data, error } = await q
      if (error) throw error
      return data as OtaCalendarEvent[]
    },
  })
}

// ─── Lấy rooms có ota_feed_url ────────────────────────────────────────────────
// M1 fix: dùng canonical useRooms() (đã mở rộng select thêm ota_feed_url/
// ota_last_synced_at) thay vì tự query riêng — tránh lệch cache key với nơi khác.
export function useRoomsWithFeed() {
  const { data, isLoading, error } = useRooms()

  const rooms: RoomWithFeed[] = (data ?? []).map((room) => ({
    id: room.id,
    name: room.name,
    ota_feed_url: room.ota_feed_url,
    ota_last_synced_at: room.ota_last_synced_at,
  }))

  return { data: rooms, isLoading, error }
}

// ─── Dismiss event (đánh dấu đã xử lý) ──────────────────────────────────────
export function useDismissOtaEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('ota_calendar_feed')
        .update({ status: 'dismissed' })
        .eq('id', eventId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ota-events'] })
      message.success('Đã dismiss event')
    },
    onError: (err: Error) => {
      message.error(`Lỗi: ${err.message}`)
    },
  })
}
