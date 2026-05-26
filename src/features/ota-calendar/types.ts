// src/features/ota-calendar/types.ts

export type OtaEventStatus = 'pending' | 'conflict' | 'synced' | 'dismissed'

export interface OtaCalendarEvent {
  id: string
  room_id: string
  ical_uid: string
  ota_source: string
  check_in: string        // 'YYYY-MM-DD'
  check_out: string
  summary: string | null
  status: OtaEventStatus
  ota_booking_num: string | null
  linked_group_id: string | null
  last_synced_at: string
}

export interface RoomWithFeed {
  id: string
  name: string
  ota_feed_url: string | null
  ota_last_synced_at: string | null
}
