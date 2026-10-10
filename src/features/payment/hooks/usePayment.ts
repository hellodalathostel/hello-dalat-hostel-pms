// src/features/payment/hooks/usePayment.ts
// v2 — SỬA: onError trước đây bỏ hoàn toàn error (`void error`), chỉ hiện thông báo chung
// "Ghi nhận thanh toán thất bại". Khi record_payment_txn từ chối vì OVERPAYMENT (P0015 — group
// đã tất toán hoặc số tiền vượt số dư còn lại), staff không biết nguyên nhân thật, dễ thử lại
// nhiều lần hoặc nghĩ là lỗi hệ thống.
//
// Giờ dịch các mã lỗi cụ thể từ RPC sang tiếng Việt dễ hiểu. PaymentModal.tsx đã đúng sẵn —
// catch rỗng, KHÔNG gọi onCancel() khi mutateAsync throw — nên modal tự nhiên không đóng khi
// lỗi, không cần sửa gì ở component.
//
// v3 — Đổi sang record_payment_idempotent_txn (chống ghi trùng). PaymentModal giữ requestId
// (usePaymentRequestId), retry/lỗi dùng lại cùng id; DB trả replayed: true nếu id đã ghi.
// Luồng checkout/cọc/tạo booking vẫn gọi record_payment_txn — không đổi.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { PaymentFormValues } from '@/lib/schemas'
import { PaymentError, recordPaymentIdempotent } from './recordPaymentIdempotent'
import type { RecordPaymentResult } from './recordPaymentIdempotent'

interface RecordPaymentPayload extends PaymentFormValues {
  groupId: string
  // Giữ nguyên khi retry; modal đổi id mới sau khi ghi thành công
  requestId: string
  // undefined khi method !== 'card' — RPC nhận null, không bắt buộc
  firstBookingId?: string
}

// Dịch mã lỗi RPC sang thông báo tiếng Việt rõ ràng cho staff.
//
// Lỗi P0015/P0016/P0017 đã được recordPaymentIdempotent map theo SQLSTATE thành PaymentError.
// Các lỗi khác (kind 'UNKNOWN') giữ message gốc của RAISE EXCEPTION → dịch tiếp theo message.
function translatePaymentError(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error ?? '')

  if (msg.includes('OVERPAYMENT')) {
    return 'Đoàn đã thanh toán đủ hoặc số dư vừa thay đổi. Vui lòng đóng cửa sổ và làm mới trước khi ghi tiền.'
  }
  if (msg.includes('GROUP_NOT_FOUND')) {
    return 'Không tìm thấy đoàn này — có thể đã bị xoá hoặc gộp. Vui lòng làm mới trang.'
  }
  if (msg.includes('BOOKING_GROUP_MISMATCH')) {
    return 'Booking không khớp với đoàn này — dữ liệu có thể đã thay đổi. Vui lòng làm mới trang.'
  }
  if (msg.includes('MISSING_BOOKING_ID')) {
    return 'Thanh toán bằng thẻ cần chọn đúng phòng để tính phụ phí. Vui lòng thử lại từ Chi tiết booking.'
  }
  if (msg.includes('INVALID_AMOUNT')) {
    return 'Số tiền không hợp lệ. Vui lòng nhập lại.'
  }

  return null
}

// Ghi nhận thanh toán thông qua RPC transaction tại database.
export function useRecordPayment() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationKey: ['record-payment'],
    mutationFn: (payload: RecordPaymentPayload): Promise<RecordPaymentResult> =>
      recordPaymentIdempotent({
        requestId: payload.requestId,
        groupId: payload.groupId,
        // Làm tròn tránh float gây lỗi Postgres integer
        amount: Math.round(payload.amount),
        method: payload.method,
        note: payload.note ?? null,
        // Truyền null khi không có — RPC chỉ bắt buộc khi method = 'card'
        firstBookingId: payload.firstBookingId ?? null,
      }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-detail'] }),
        // Đồng bộ thêm bookings + groups để folio/summary đúng
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ])

      if (result.replayed) {
        // Cùng request_id đã ghi trước đó (retry sau timeout/double submit) — không ghi thêm.
        message.info('Khoản này đã được ghi trước đó.')
      } else {
        message.success('Ghi nhận thanh toán thành công')
      }
    },
    onError: async (error) => {
      // SỬA: dịch lỗi cụ thể thay vì bỏ qua hoàn toàn (`void error`).
      // Lỗi đã map theo SQLSTATE (P0015/P0016/P0017) → dùng thẳng message của PaymentError.
      const translated =
        error instanceof PaymentError && error.kind !== 'UNKNOWN'
          ? error.message
          : translatePaymentError(error)
      if (translated) {
        message.error(translated)
      } else {
        const fallbackMsg = error instanceof Error ? error.message : 'Ghi nhận thanh toán thất bại'
        message.error(fallbackMsg)
      }

      // Invalidate dashboard/today dù lỗi — vì OVERPAYMENT/STALE nghĩa là dữ liệu client đang
      // cũ, cần refetch để staff thấy số mới nhất khi họ mở lại modal.
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    },
  })
}
