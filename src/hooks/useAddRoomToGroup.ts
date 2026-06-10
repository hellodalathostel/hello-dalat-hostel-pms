import { useMutation, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { supabase } from '@/api/supabase'

export interface AddRoomPayload {
  group_id: string
  room_id: string
  check_in: string
  check_out: string
  price_per_night: number
  guests_count?: number
  note?: string
}

export function useAddRoomToGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: AddRoomPayload) => {
      const { data, error } = await supabase.rpc('add_booking_to_group_txn', {
        p_group_id: payload.group_id,
        p_room_id: payload.room_id,
        p_check_in: payload.check_in,
        p_check_out: payload.check_out,
        p_price_per_night: payload.price_per_night,
        p_guests_count: payload.guests_count ?? 1,
        p_note: payload.note ?? null,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data as { success: boolean; booking_id: string; group_id: string }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['group', data.group_id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      message.success('Đã thêm phòng vào đặt phòng')
    },
    onError: (err: Error) => {
      const raw = err.message

      if (raw.includes('ROOM_CONFLICT')) {
        message.error('Phòng đã có lịch trong khoảng thời gian này')
      } else if (raw.includes('INVALID_NIGHTS')) {
        message.error('Ngày trả phòng phải sau ngày nhận phòng')
      } else if (raw.includes('GROUP_NOT_FOUND')) {
        message.error('Không tìm thấy đặt phòng')
      } else {
        message.error(`Lỗi: ${raw}`)
      }
    },
  })
}
