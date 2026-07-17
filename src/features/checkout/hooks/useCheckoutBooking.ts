// src/features/checkout/hooks/useCheckoutBooking.ts
// v2 — Thay thế hoàn toàn logic cũ (record_payment_txn + checkout_booking_txn tách rời)
// bằng 1 lệnh RPC atomic duy nhất, chọn đúng RPC theo việc booking có phải
// booking active cuối cùng trong group hay không.
//
// BREAKING CHANGE so với v1:
//   - useCheckoutBooking() không còn nhận { bookingId } đơn thuần — cần biết
//     isLastActiveBooking (lấy từ folio hoặc dashboard_today.is_last_active_booking)
//     và nếu là booking cuối, cần paymentMethod (khi còn nợ) + note tuỳ chọn.
//   - useRecordPayment() đứng riêng vẫn giữ nguyên cho các use-case KHÔNG phải
//     checkout (ví dụ: thu cọc giữa kỳ) — không đổi.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import type { PaymentMethod } from '@/types/database'
import { normalizeError } from '@/shared/utils/normalizeError'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

export interface RecordPaymentParams {
  groupId: string
  amount: number
  method: PaymentMethod
  note?: string
  firstBookingId?: string
}

// Discriminated union theo isLastActiveBooking: khi true, TypeScript BẮT BUỘC 2 expected field
// ngay ở compile-time (không chỉ validate runtime) — sửa theo góp ý dùng discriminated union
// thay vì optional field + check runtime đơn thuần.
type CheckoutParamsNotLast = {
  bookingId: string
  isLastActiveBooking: false
}

type CheckoutParamsLast = {
  bookingId: string
  isLastActiveBooking: true
  /** Bắt buộc nếu còn nợ (remaining > 0); có thể bỏ qua nếu remaining <= 0 */
  paymentMethod?: PaymentMethod
  note?: string
  /** #3 BẮT BUỘC ở compile-time: số group.grand_total staff đang nhìn thấy.
   *  RPC cũng yêu cầu tường minh (không có default NULL) — thiếu sẽ bị RPC từ chối P0037. */
  expectedGroupGrandTotal: number
  /** #3 BẮT BUỘC ở compile-time: số group.paid staff đang nhìn thấy */
  expectedGroupPaid: number
}

export type CheckoutParams = CheckoutParamsNotLast | CheckoutParamsLast

type RecordPaymentResult = {
  success: boolean
  surcharge_amount: number
  card_fee_applied: boolean
}

type CheckoutResult = {
  ok: boolean
  booking_id: string
  group_id: string
  group_closed: boolean
  remaining_before_payment?: number
  surcharge_amount?: number
  card_fee_applied?: boolean
}

// Giữ nguyên cho use-case thu cọc/thu tiền KHÔNG kèm checkout (không đổi so với v1).
export function useRecordPayment() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (params: RecordPaymentParams): Promise<RecordPaymentResult> => {
      try {
        const { data, error } = await supabase.rpc('record_payment_txn', {
          p_group_id: params.groupId,
          p_amount: params.amount,
          p_method: params.method,
          p_note: params.note ?? null,
          p_first_booking_id: params.firstBookingId ?? null,
        })

        if (error) {
          throw error
        }

        return (data ?? { success: false, surcharge_amount: 0, card_fee_applied: false }) as RecordPaymentResult
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async (_result, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group', vars.groupId] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings-list'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-folio'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
      ])
    },
    onError: (error: Error) => {
      message.error(`Lỗi ghi payment: ${error.message}`)
    },
  })
}

// RPC atomic mới: tự chọn checkout_single_booking_txn hoặc
// checkout_last_booking_and_settle_txn dựa trên isLastActiveBooking.
// Không còn gọi 2 lệnh riêng — loại bỏ hoàn toàn nguy cơ "ghi payment thành công
// nhưng checkout thất bại" vì cả 2 thao tác giờ nằm trong 1 transaction DB.
export function useCheckoutBooking() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (params: CheckoutParams): Promise<CheckoutResult> => {
      try {
        if (params.isLastActiveBooking) {
          // TypeScript đã enforce expectedGroupGrandTotal/expectedGroupPaid là number bắt buộc
          // (discriminated union) — không còn cần validate runtime undefined ở đây.
          const { data, error } = await supabase.rpc('checkout_last_booking_and_settle_txn', {
            p_booking_id: params.bookingId,
            p_expected_group_grand_total: params.expectedGroupGrandTotal,
            p_expected_group_paid: params.expectedGroupPaid,
            p_payment_method: params.paymentMethod ?? null,
            p_note: params.note ?? null,
          })

          if (error) {
            // #4(cũ)/stale: dịch lỗi STALE_GROUP_BALANCE sang thông báo rõ ràng để UI yêu cầu refresh.
            if (error.code === 'P0035' || error.message?.includes('STALE_GROUP_BALANCE')) {
              throw new Error('Số dư của đoàn đã thay đổi (có người vừa ghi thanh toán khác). Vui lòng đóng và mở lại để xem số mới nhất trước khi thu.')
            }
            if (error.code === 'P0036' || error.message?.includes('STALE_BOOKING')) {
              throw new Error('Booking đã thay đổi (có thể vừa bị sửa ở nơi khác). Vui lòng đóng và mở lại.')
            }
            throw error
          }

          const result = data as CheckoutResult | null
          if (!result || result.ok !== true) {
            throw new Error('Checkout thất bại — phản hồi RPC không hợp lệ')
          }

          return result
        }

        const { data, error } = await supabase.rpc('checkout_single_booking_txn', {
          p_booking_id: params.bookingId,
        })

        if (error) {
          throw error
        }

        const result = data as CheckoutResult | null
        if (!result || result.ok !== true) {
          throw new Error('Checkout thất bại — phản hồi RPC không hợp lệ')
        }

        return result
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rooms'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings-list'] }),
        queryClient.invalidateQueries({ queryKey: ['todayBookings'] }),
        queryClient.invalidateQueries({ queryKey: ['roomMap'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-folio'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ])
    },
    onError: (error: Error) => {
      message.error(`Lỗi checkout: ${error.message}`)
    },
  })
}
