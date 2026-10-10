// src/features/payment/hooks/usePaymentRequestId.ts
import { useCallback, useRef } from 'react'

/** Giữ 1 request_id cho tới khi ghi thành công. Lỗi/retry dùng lại cùng id. */
export function usePaymentRequestId() {
  const ref = useRef<string>(crypto.randomUUID())
  const get = useCallback(() => ref.current, [])
  const rotate = useCallback(() => {
    ref.current = crypto.randomUUID()
  }, [])
  return { get, rotate }
}
