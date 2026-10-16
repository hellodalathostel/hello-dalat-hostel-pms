import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import { useRefreshBookingData } from '@/shared/hooks/useRefreshBookingData'

interface VoidPaymentPayload {
  paymentId: string
  note?: string
}

export function useVoidPayment() {
  const refreshBookingData = useRefreshBookingData()
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
      await refreshBookingData()
      message.success('Đã void payment')
    },
    onError: (error: Error) => {
      message.error(error.message ?? 'Void thất bại')
    },
  })
}
