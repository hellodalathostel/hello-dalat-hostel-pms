// src/features/payment/hooks/recordPaymentIdempotent.ts
// Gọi record_payment_idempotent_txn. Cùng request_id gửi lại → DB trả kết quả cũ với replayed: true,
// không ghi thêm payment_history. Map mã lỗi theo error.code (SQLSTATE) TRƯỚC KHI qua normalizeError,
// vì normalizeError có thể trả Error mới không còn field code.
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { PaymentMethod } from '@/types/database'

export interface RecordPaymentInput {
  requestId: string
  groupId: string
  amount: number // integer VND
  method: PaymentMethod
  note?: string | null
  firstBookingId?: string | null
}

export type RecordPaymentResult = { replayed: boolean } & Record<string, unknown>

export type PaymentErrorKind =
  | 'OVERPAYMENT' | 'MISSING_REQUEST_ID' | 'REQUEST_ID_REUSED' | 'UNKNOWN'

export class PaymentError extends Error {
  kind: PaymentErrorKind
  constructor(kind: PaymentErrorKind, message: string) {
    super(message)
    this.name = 'PaymentError'
    this.kind = kind
  }
}

export async function recordPaymentIdempotent(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  try {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new PaymentError('UNKNOWN', 'Số tiền không hợp lệ.')
    }
    const { data, error } = await supabase.rpc('record_payment_idempotent_txn', {
      p_request_id: input.requestId,
      p_group_id: input.groupId,
      p_amount: input.amount,
      p_method: input.method,
      p_note: input.note ?? null,
      p_first_booking_id: input.firstBookingId ?? null,
    })
    if (error) {
      if (error.code === 'P0015') {
        throw new PaymentError(
          'OVERPAYMENT',
          'Đoàn đã thanh toán đủ hoặc số dư vừa thay đổi. Vui lòng đóng cửa sổ và làm mới trước khi ghi tiền.',
        )
      }
      if (error.code === 'P0016') throw new PaymentError('MISSING_REQUEST_ID', 'Thiếu mã yêu cầu thanh toán.')
      if (error.code === 'P0017') {
        throw new PaymentError(
          'REQUEST_ID_REUSED',
          'Lần gửi trước có thể đã được ghi. Kiểm tra lịch sử thanh toán trước khi ghi lại.',
        )
      }
      // Giữ nguyên message gốc (GROUP_NOT_FOUND, MISSING_BOOKING_ID, ...) để hook dịch tiếp.
      throw new PaymentError('UNKNOWN', normalizeError(error).message)
    }
    return data as RecordPaymentResult
  } catch (err) {
    if (err instanceof PaymentError) throw err
    throw new PaymentError('UNKNOWN', normalizeError(err).message)
  }
}
