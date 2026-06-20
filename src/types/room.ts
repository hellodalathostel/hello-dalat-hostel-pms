import type { HousekeepingStatus } from '@/types/database'

export interface Room {
  id: string
  name: string
  type: string
  capacity: number
  base_price: number
  floor: number | null
  is_active: boolean
  housekeeping_status: HousekeepingStatus
  housekeeping_note: string | null
  ical_export_token: string
  ota_feed_url: string | null
  ota_last_synced_at: string | null
}
