import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

interface VoidBookingParams {
  bookingId: string
  groupId: string
  reason?: string
}

interface VoidBookingResponse {
  success: boolean
  action: string
  booking_id: string
  group_id: string
}

export function useVoidBooking() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationKey: ['void-booking'],
    mutationFn: async ({ bookingId, reason }: VoidBookingParams) => {
      try {
        const { data, error } = await supabase.rpc('void_checkedout_booking_txn', {
          p_booking_id: bookingId,
          p_reason: reason ?? null,
        })

        if (error) {
          throw error
        }

        return data as VoidBookingResponse
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings-list'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] }),
        queryClient.invalidateQueries({ queryKey: ['booking-detail', variables.groupId] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
      ])

      message.success('Đã xóa booking và hoàn lại doanh thu')
    },
    onError: (error: Error) => {
      const msg = error.message

      if (msg.includes('PERMISSION_DENIED')) {
        message.error('Chỉ Owner mới được xóa booking đã trả phòng')
        return
      }

      if (msg.includes('INVALID_STATUS')) {
        message.error('Booking này không ở trạng thái đã trả phòng')
        return
      }

      message.error(`Lỗi: ${msg}`)
    },
  })
}
