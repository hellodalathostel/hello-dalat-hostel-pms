import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

interface VoidPaymentPayload {
  paymentId: string
  note?: string
}

export function useVoidPayment(bookingId: string, groupId: string) {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationKey: ['void-payment'],
    mutationFn: async ({ paymentId, note }: VoidPaymentPayload) => {
      try {
        const { data, error } = await supabase.rpc('void_payment_txn', {
          p_payment_id: paymentId,
          p_note: note ?? 'Void: nhập nhầm',
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
        queryClient.invalidateQueries({ queryKey: ['booking-folio', bookingId] }),
        queryClient.invalidateQueries({ queryKey: ['booking-detail', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ])
      message.success('Đã void payment')
    },
    onError: (error: Error) => {
      message.error(error.message ?? 'Void thất bại')
    },
  })
}
