import { supabase } from '@/api/supabase'

export interface DashboardSummary {
  occupancy_rate: number
  checkin_today: number
  checkout_today: number
  pending_group_bookings: number
}

export async function fetchDashboardSummary(): Promise<DashboardSummary | null> {
  const { data, error } = await supabase.from('dashboard_today').select('*').maybeSingle()

  if (error) {
    throw error
  }

  return data
}
