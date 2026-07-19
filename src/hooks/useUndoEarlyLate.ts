import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { EarlyLateType } from './useAddEarlyLate'

export interface UndoEarlyLateParams {
  bookingId: string
  type: EarlyLateType
}

export interface UndoEarlyLateResult {
  success: boolean
  type: EarlyLateType
  service_deleted: boolean
  block_deleted: boolean
}

export function useUndoEarlyLate() {
  const queryClient = useQueryClient()
  const { notification, modal } = useAppFeedback()

  return useMutation({
    mutationFn: async (params: UndoEarlyLateParams): Promise<UndoEarlyLateResult> => {
      try {
        const { data, error } = await supabase.rpc('undo_early_late_txn', {
          p_booking_id: params.bookingId,
          p_type: params.type,
        })

        if (error) {
          throw error
        }

        return data as UndoEarlyLateResult
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: (data, params) => {
      void data
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['booking', params.bookingId] })
      queryClient.invalidateQueries({ queryKey: ['booking-folio', params.bookingId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
      queryClient.invalidateQueries({ queryKey: ['room-blocks'] })

      const label = params.type === 'early' ? 'Early check-in' : 'Late check-out'
      notification.success({ message: `Đã hủy ${label}` })
    },
    onError: (error) => {
      const msg = normalizeError(error).message

      if (msg.includes('booking_locked')) {
        modal.error({
          title: 'Không thể hủy',
          content: 'Booking đã checked-out hoặc cancelled, không thể hủy Early/Late.',
        })
      } else if (msg.includes('early_check_in_not_applied')) {
        modal.error({ title: 'Không thể hủy', content: 'Early check-in chưa được áp dụng.' })
      } else if (msg.includes('late_check_out_not_applied')) {
        modal.error({ title: 'Không thể hủy', content: 'Late check-out chưa được áp dụng.' })
      } else if (msg.includes('booking_not_found')) {
        modal.error({ title: 'Không thể hủy', content: 'Không tìm thấy booking.' })
      } else {
        modal.error({ title: 'Có lỗi xảy ra', content: 'Vui lòng thử lại.' })
      }
    },
  })
}
