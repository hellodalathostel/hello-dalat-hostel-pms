// Hook ghi thanh toán (trước gọi là "cọc") — dùng record_payment_idempotent_txn RPC
// (bọc record_payment_txn, chống ghi trùng khi retry — xem payment/utils/paymentRequestId.ts)
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { useRefreshBookingData } from '@/shared/hooks/useRefreshBookingData'
import { normalizeError } from '@/shared/utils/normalizeError'
import {
  PAYMENT_REPLAYED_MESSAGE,
  isReplayed,
  isRequestIdReused,
  usePaymentRequestIdStore,
} from '@/features/payment/utils/paymentRequestId'

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
  const requestIds = usePaymentRequestIdStore()

  const addDeposit = useMutation({
    mutationFn: async (payload: DepositPayload) => {
      // RPC nhận integer — làm tròn trước để khoá ý định thu đúng số DB nhận
      const amount = Math.round(payload.amount)
      const requestId = requestIds.get({ groupId: payload.groupId, amount, method: payload.method })
      try {
        const { data, error } = await supabase.rpc('record_payment_idempotent_txn', {
          p_request_id: requestId,
          p_group_id: payload.groupId,
          p_amount: amount,
          p_method: payload.method,
          p_note: payload.note ?? null,
          p_first_booking_id: payload.firstBookingId ?? null,
        })
        if (error) throw error
        requestIds.consume(requestId)
        return data
      } catch (error) {
        if (isRequestIdReused(error)) requestIds.consume(requestId)
        throw normalizeError(error)
      }
    },
    onSuccess: (data) => {
      // replayed = true: khoản đã ghi ở lần gửi trước — báo nhẹ, không ghi trùng
      if (isReplayed(data)) {
        message.info(PAYMENT_REPLAYED_MESSAGE)
      } else {
        message.success('Đã ghi nhận thanh toán')
      }
      void invalidate()
    },
    onError: (err: Error) => {
      message.error(`Lỗi ghi thanh toán: ${err.message}`)
    },
  })

  return { addDeposit }
}
