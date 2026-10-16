// src/features/dashboard/hooks/useOverdueBookings.ts
// Danh sách "Quá hạn cần xử lý": booking đang checked-in nhưng check_out đã qua (theo ngày ICT).
// Chỉ đọc — KHÔNG tự động check-out. Check-out thủ công từng dòng ở Dashboard.
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'

export type OverdueBooking = {
  bookingId: string
  groupId: string
  roomId: string // rooms.id
  customerName: string | null
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  daysOverdue: number // today - check_out, theo ngày ICT
  groupGrandTotal: number
  groupPaid: number
  remaining: number // groupGrandTotal - groupPaid
  isLastActiveInGroup: boolean // số booking active trong group (gồm chính nó) === 1
}

interface RawOverdueBooking {
  id: string
  group_id: string
  room_id: string
  check_in: string
  check_out: string
  status: string
}

interface RawGroup {
  id: string
  customer_name: string | null
  grand_total: number | null
  paid: number | null
}

interface RawActiveBooking {
  id: string
  group_id: string
}

// Hôm nay theo ICT (YYYY-MM-DD) — không dùng toISOString() vì lệch ngày trước 07:00 sáng.
export function getTodayIct(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

export async function fetchOverdueBookings(today: string = getTodayIct()): Promise<OverdueBooking[]> {
  // Bước A: booking quá hạn
  const { data: overdueData, error } = await supabase
    .from('bookings')
    .select('id, group_id, room_id, check_in, check_out, status')
    .eq('status', 'checked-in')
    .eq('is_deleted', false)
    .lt('check_out', today)
    .order('check_out', { ascending: true })

  if (error) {
    throw normalizeError(error)
  }

  const overdue = (overdueData ?? []) as RawOverdueBooking[]
  if (overdue.length === 0) return []

  const groupIds = [...new Set(overdue.map((b) => b.group_id))]

  // Bước B1: thông tin group (tiền + tên khách)
  // Bước B2: tất cả booking còn active trong các group đó (để biết "booking cuối" hay không)
  const [groupsResult, activeResult] = await Promise.all([
    supabase
      .from('groups')
      .select('id, customer_name, grand_total, paid')
      .in('id', groupIds)
      .eq('is_deleted', false),
    supabase
      .from('bookings')
      .select('id, group_id')
      .in('group_id', groupIds)
      .in('status', ['booked', 'checked-in'])
      .eq('is_deleted', false),
  ])

  if (groupsResult.error) {
    throw normalizeError(groupsResult.error)
  }
  if (activeResult.error) {
    throw normalizeError(activeResult.error)
  }

  const groupsById = new Map<string, RawGroup>()
  for (const g of (groupsResult.data ?? []) as RawGroup[]) {
    groupsById.set(g.id, g)
  }

  const activeCountByGroup = new Map<string, number>()
  for (const b of (activeResult.data ?? []) as RawActiveBooking[]) {
    activeCountByGroup.set(b.group_id, (activeCountByGroup.get(b.group_id) ?? 0) + 1)
  }

  const todayDay = dayjs(today)
  const rows: OverdueBooking[] = []

  for (const b of overdue) {
    const group = groupsById.get(b.group_id)
    if (!group) {
      console.warn(`[useOverdueBookings] Bỏ qua booking ${b.id}: group ${b.group_id} không tồn tại hoặc đã soft-delete`)
      continue
    }

    const groupGrandTotal = group.grand_total ?? 0
    const groupPaid = group.paid ?? 0

    rows.push({
      bookingId: b.id,
      groupId: b.group_id,
      roomId: b.room_id,
      customerName: group.customer_name,
      checkIn: b.check_in,
      checkOut: b.check_out,
      daysOverdue: todayDay.diff(dayjs(b.check_out), 'day'),
      groupGrandTotal,
      groupPaid,
      remaining: groupGrandTotal - groupPaid,
      isLastActiveInGroup: (activeCountByGroup.get(b.group_id) ?? 0) === 1,
    })
  }

  return rows
}

export function useOverdueBookings() {
  return useQuery({
    queryKey: ['dashboard', 'overdue-bookings'],
    queryFn: () => fetchOverdueBookings(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })
}
