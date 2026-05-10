import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { PaymentFormValues } from '@/lib/schemas'

interface RecordPaymentPayload extends PaymentFormValues {
  groupId: string
  firstBookingId: string
}

// Ghi nhận thanh toán thông qua RPC transaction tại database.
export function useRecordPayment() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationKey: ['record-payment'],
    mutationFn: async (payload: RecordPaymentPayload) => {
      try {
        const { data, error } = await supabase.rpc('record_payment_txn', {
          p_group_id: payload.groupId,
          p_amount: payload.amount,
          p_method: payload.method,
          p_note: payload.note ?? '',
          p_first_booking_id: payload.firstBookingId,
        })

        if (error) {
          throw error
        }

        return data
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async () => {
      // [Fix 3] — Đồng bộ invalidate theo convention query key mới.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-detail'] }),
      ])

      message.success('Ghi nhận thanh toán thành công')
    },
    onError: (error) => {
      void error
      // [Fix 3] — Theo yêu cầu nghiệp vụ, hiển thị toast lỗi ngắn gọn khi ghi nhận thất bại.
      message.error('Ghi nhận thanh toán thất bại')
    },
  })
}