// Hook ghi thanh toán (trước gọi là "cọc") — dùng record_payment_idempotent_txn RPC
// (bọc record_payment_txn; cùng request_id + cùng group/số tiền/method → không ghi đôi)
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { useRefreshBookingData } from '@/shared/hooks/useRefreshBookingData'
import type { RecordPaymentIdempotentResult } from '@/types/database'

type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other' | 'momo' | 'zalopay'

interface DepositPayload {
  groupId: string
  amount: number
  method: PaymentMethod
  note?: string
  firstBookingId?: string
  // Sinh ở component (usePaymentRequestId) — KHÔNG sinh trong mutationFn để retry giữ nguyên id
  requestId: string
}

export function useDepositActions() {
  const { message } = useAppFeedback()
  // Tải lại folio + drawer + danh sách sau mỗi thao tác (B-03)
  const invalidate = useRefreshBookingData()

  const addDeposit = useMutation({
    mutationFn: async (payload: DepositPayload): Promise<RecordPaymentIdempotentResult> => {
      const { data, error } = await supabase.rpc('record_payment_idempotent_txn', {
        p_request_id: payload.requestId,
        p_group_id: payload.groupId,
        p_amount: payload.amount,
        p_method: payload.method,
        p_note: payload.note ?? null,
        p_first_booking_id: payload.firstBookingId ?? null,
      })
      if (error) throw error
      return data as RecordPaymentIdempotentResult
    },
    onSuccess: (data) => {
      if (data?.replayed === true) {
        message.info('Khoản thanh toán này đã được ghi trước đó, hệ thống không ghi lại lần nữa.')
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
