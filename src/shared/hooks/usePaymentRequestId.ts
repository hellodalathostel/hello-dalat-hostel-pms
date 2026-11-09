import { useCallback, useRef } from 'react'

/**
 * request_id cho record_payment_idempotent_txn.
 * - Cùng khoá (group|amount|method) => cùng id: bấm đúp / retry sau lỗi mạng sẽ được DB nhận ra (replayed=true).
 * - Khoá đổi (nhập lại số tiền/phương thức) => id mới.
 * - rotateRequestId(): gọi sau khi ghi thành công và khi đóng modal.
 */
export function usePaymentRequestId() {
  const ref = useRef<{ id: string; key: string } | null>(null)

  const getRequestId = useCallback((key: string): string => {
    if (!ref.current || ref.current.key !== key) {
      ref.current = { id: crypto.randomUUID(), key }
    }
    return ref.current.id
  }, [])

  const rotateRequestId = useCallback(() => {
    ref.current = null
  }, [])

  return { getRequestId, rotateRequestId }
}
