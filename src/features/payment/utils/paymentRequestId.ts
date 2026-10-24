// src/features/payment/utils/paymentRequestId.ts
// Quản lý p_request_id cho record_payment_idempotent_txn.
//
// Quy tắc: MỘT request_id cho mỗi ý định thu tiền (group + số tiền + phương thức).
//   - Retry / bấm lại sau lỗi mạng với cùng ý định → TÁI SỬ DỤNG id cũ, để DB nhận ra
//     khoản đã ghi (replayed = true) thay vì ghi trùng.
//   - Đổi group / số tiền / phương thức → sinh id mới (id cũ dùng cho khoản khác sẽ bị
//     RPC từ chối P0017 REQUEST_ID_REUSED).
//   - Thu thành công → consume(): lần thu kế tiếp (kể cả cùng số tiền) là khoản mới.
// Lỗi nghiệp vụ (OVERPAYMENT, ...) rollback cả dòng log ở DB nên giữ id để retry vẫn an toàn.
import { useState } from 'react'

export interface PaymentIntent {
  groupId: string
  /** Đã làm tròn — RPC nhận integer */
  amount: number
  method: string
}

export interface PaymentRequestIdStore {
  /** Trả id cho ý định này: dùng lại nếu trùng ý định đang chờ, ngược lại sinh mới. */
  get: (intent: PaymentIntent) => string
  /** Đánh dấu ý định hiện tại đã thu xong — lần get() sau sẽ sinh id mới. */
  consume: (requestId: string) => void
}

const intentKey = (i: PaymentIntent) => `${i.groupId}|${i.amount}|${i.method}`

export function createPaymentRequestIdStore(
  generate: () => string = () => crypto.randomUUID(),
): PaymentRequestIdStore {
  let pending: { key: string; requestId: string } | null = null

  return {
    get(intent) {
      const key = intentKey(intent)
      if (pending?.key !== key) {
        pending = { key, requestId: generate() }
      }
      return pending.requestId
    },
    consume(requestId) {
      // Chỉ xoá nếu đúng id vừa thành công (tránh xoá id của ý định mới hơn)
      if (pending?.requestId === requestId) pending = null
    },
  }
}

/** Store request_id sống theo vòng đời component dùng hook thu tiền. */
export function usePaymentRequestIdStore(): PaymentRequestIdStore {
  const [store] = useState(() => createPaymentRequestIdStore())
  return store
}

/** Kết quả record_payment_idempotent_txn — như record_payment_txn, thêm cờ replayed. */
export interface IdempotentPaymentResult {
  replayed?: boolean
  [key: string]: unknown
}

export function isReplayed(data: unknown): boolean {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data as IdempotentPaymentResult).replayed === true
  )
}

export const PAYMENT_REPLAYED_MESSAGE = 'Khoản thu này đã được ghi trước đó — không ghi trùng.'

/** P0017: request_id đã dùng cho khoản thu khác — bỏ id này, lần sau sinh id mới. */
export function isRequestIdReused(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return code === 'P0017' || (typeof message === 'string' && message.includes('REQUEST_ID_REUSED'))
}
