// Hook xử lý nhập cọc — dùng record_payment_txn RPC
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { useRefreshBookingData } from '@/shared/hooks/useRefreshBookingData'

type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other' | 'momo' | 'zalopay'

interface DepositPayload {
  groupId: string
  amount: number
  method: PaymentMethod
  note?: string
  firstBookingId?: string
}

export function useDepositActions() {
  const { message } = useAppFeedback()
  // Tải lại folio + drawer + danh sách sau mỗi thao tác (B-03)
  const invalidate = useRefreshBookingData()

  const addDeposit = useMutation({
    mutationFn: async (payload: DepositPayload) => {
      const { data, error } = await supabase.rpc('record_payment_txn', {
        p_group_id: payload.groupId,
        p_amount: payload.amount,
        p_method: payload.method,
        p_note: payload.note ?? null,
        p_first_booking_id: payload.firstBookingId ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      message.success('Đã ghi nhận cọc')
      void invalidate()
    },
    onError: (err: Error) => {
      message.error(`Lỗi ghi cọc: ${err.message}`)
    },
  })

  return { addDeposit }
}
