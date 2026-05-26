// src/features/ota-calendar/hooks/useOtaCalendar.ts
// Query danh sách OTA events + rooms có feed

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { supabase } from '@/lib/supabase'
import type { OtaCalendarEvent, RoomWithFeed } from '../types'

// ─── Query keys ──────────────────────────────────────────────────────────────
export const otaKeys = {
  events: (filters?: { status?: string; room_id?: string }) =>
    ['ota-events', filters] as const,
  rooms: () => ['ota-rooms'] as const,
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
export function useRoomsWithFeed() {
  return useQuery({
    queryKey: otaKeys.rooms(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name, ota_feed_url, ota_last_synced_at')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as RoomWithFeed[]
    },
  })
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
