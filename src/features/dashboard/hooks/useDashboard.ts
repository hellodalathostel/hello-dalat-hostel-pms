import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import type { DashboardRoom, RoomStatus } from '@/types/dashboard'
import { normalizeError } from '@/shared/utils/normalizeError'

// Chuẩn hóa trạng thái phòng để render UI đồng nhất theo rule nghiệp vụ.
export function getRoomStatus(room: DashboardRoom): RoomStatus {
  if (room.is_blocked) {
    return 'blocked'
  }

  if (room.status === null) {
    return 'vacant'
  }

  if (room.status === 'booked') {
    return 'arriving'
  }

  return 'occupied'
}

async function fetchDashboardRooms(): Promise<DashboardRoom[]> {
  try {
    const { data, error } = await supabase.from('dashboard_today').select('*').order('room_id')

    if (error) {
      throw error
    }

    return (data ?? []) as DashboardRoom[]
  } catch (error) {
    throw normalizeError(error)
  }
}

// Hook dữ liệu dashboard với cơ chế tự làm mới định kỳ 5 phút.
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: fetchDashboardRooms,
    staleTime: 0, // Tường minh: dashboard cần luôn fresh khi focus lại tab (real-time tình trạng phòng)
    gcTime: 60_000, // 1 phút — không cần giữ cache lâu vì luôn refetch khi mount
    refetchInterval: 300000,
    refetchOnWindowFocus: true,
  })
}
