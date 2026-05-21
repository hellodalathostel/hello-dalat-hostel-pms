import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { PaymentFormValues } from '@/lib/schemas'

interface RecordPaymentPayload extends PaymentFormValues {
  groupId: string
  // undefined khi method !== 'card' — RPC nhận null, không bắt buộc
  firstBookingId?: string
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
          // Làm tròn tránh float gây lỗi Postgres integer
          p_amount: Math.round(payload.amount),
          p_method: payload.method,
          p_note: payload.note ?? null,
          // Truyền null khi không có — RPC chỉ bắt buộc khi method = 'card'
          p_first_booking_id: payload.firstBookingId ?? null,
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-detail'] }),
        // Đồng bộ thêm bookings + groups để folio/summary đúng
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ])

      message.success('Ghi nhận thanh toán thành công')
    },
    onError: (error) => {
      void error
      message.error('Ghi nhận thanh toán thất bại')
    },
  })
}