import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

export type EarlyLateType = 'early' | 'late'

export interface AddEarlyLateParams {
  bookingId: string
  type: EarlyLateType
  fee: number
}

export interface AddEarlyLateResult {
  success: boolean
  type: EarlyLateType
  new_check_in: string
  new_check_out: string
  fee: number
}

export function useAddEarlyLate() {
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()

  const notifySuccess = (message: string) => {
    notification.success({ message })
  }

  const notifyError = (message: string) => {
    notification.error({ message })
  }

  return useMutation({
    mutationFn: async (params: AddEarlyLateParams): Promise<AddEarlyLateResult> => {
      try {
        const { data, error } = await supabase.rpc('add_early_late_txn', {
          p_booking_id: params.bookingId,
          p_type: params.type,
          p_fee: params.fee,
        })

        if (error) {
          throw error
        }

        return data as AddEarlyLateResult
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: (data, params) => {
      // Invalidate để Room Map, Booking List, Folio cập nhật
      void data
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['booking', params.bookingId] })
      queryClient.invalidateQueries({ queryKey: ['booking-folio', params.bookingId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })

      const label = params.type === 'early' ? 'Early check-in' : 'Late check-out'
      notifySuccess(`${label} đã được áp dụng`)
    },
    onError: (error) => {
      const msg = normalizeError(error).message

      if (msg.includes('room_not_available')) {
        notifyError('Phòng đã có booking trong đêm này - không thể extend')
      } else if (msg.includes('early_check_in_already_applied')) {
        notifyError('Early check-in đã được áp dụng trước đó')
      } else if (msg.includes('late_check_out_already_applied')) {
        notifyError('Late check-out đã được áp dụng trước đó')
      } else if (msg.includes('booking_not_found')) {
        notifyError('Không tìm thấy booking')
      } else {
        notifyError('Có lỗi xảy ra - vui lòng thử lại')
      }
    },
  })
}