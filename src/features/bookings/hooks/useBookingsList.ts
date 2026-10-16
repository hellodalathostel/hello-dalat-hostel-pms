import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface BookingsListItem {
  group_id: string
  first_booking_code: string | null
  customer_name: string
  customer_phone: string | null
  source: string
  paid: number
  grand_total: number
  balance_due: number
  earliest_check_in: string
  latest_check_out: string
  rooms: string[]
  statuses: string[]
  created_at: string
}

type GroupBookingRow = {
  id: string
  customer_name: string
  customer_phone: string | null
  source: string | null
  paid: number | null
  grand_total: number | null
  is_deleted: boolean | null
  created_at: string
  bookings: {
    id: string
    room_id: string
    code: string | null
    check_in: string
    check_out: string
    grand_total: number | null
    status: string
    is_deleted: boolean
  }[] | null
}

async function fetchBookingsList(): Promise<BookingsListItem[]> {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select(`
        id,
        customer_name,
        customer_phone,
        source,
        paid,
        grand_total,
        is_deleted,
        created_at,
        bookings (
          id,
          room_id,
          code,
          check_in,
          check_out,
          grand_total,
          status,
          is_deleted
        )
      `)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const groups = ((data ?? []) as GroupBookingRow[])
      .map((group) => ({
        group,
        nonDeletedBookings: (group.bookings ?? []).filter((booking) => !booking.is_deleted),
      }))
      // Ẩn group không còn booking nào (mọi booking đã xoá mềm) VÀ không còn tiền đã thu,
      // ví dụ group TEST QA1510: trước đây hiện thành dòng trống phòng/ngày trong trang Đặt phòng.
      // Group còn paid ≠ 0 vẫn hiện để không giấu tiền chưa xử lý (hoàn/chuyển).
      .filter(({ group, nonDeletedBookings }) => nonDeletedBookings.length > 0 || (group.paid ?? 0) !== 0)

    return groups.map(({ group, nonDeletedBookings }) => {
      const activeBookings = nonDeletedBookings.filter((booking) => booking.status !== 'cancelled')
      const firstBookingCode = activeBookings[0]?.code ?? nonDeletedBookings[0]?.code ?? null
      const grandTotal = group.grand_total ?? 0
      const checkIns = activeBookings.map((booking) => booking.check_in).filter(Boolean)
      const checkOuts = activeBookings.map((booking) => booking.check_out).filter(Boolean)

      return {
        group_id: group.id,
        first_booking_code: firstBookingCode,
        customer_name: group.customer_name,
        customer_phone: group.customer_phone ?? null,
        source: group.source ?? 'walk-in',
        paid: group.paid ?? 0,
        grand_total: grandTotal,
        balance_due: grandTotal - (group.paid ?? 0),
        earliest_check_in: checkIns.sort()[0] ?? '',
        latest_check_out: checkOuts.sort().at(-1) ?? '',
        rooms: [...new Set(activeBookings.map((booking) => booking.room_id))],
        statuses: [...new Set(nonDeletedBookings.map((booking) => booking.status))],
        created_at: group.created_at,
      }
    })
  } catch (error) {
    throw normalizeError(error)
  }
}

export function useBookingsList() {
  return useQuery({
    queryKey: ['bookings-list'],
    queryFn: fetchBookingsList,
    staleTime: 30_000, // 30s — danh sách booking thay đổi khi staff thao tác
    gcTime: 5 * 60_000, // 5 phút — giữ cache khi chuyển tab/trang rồi quay lại
  })
}