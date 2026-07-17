// src/features/checkout/hooks/useCheckOut.ts
// v3 — Thay checkout_group_txn (cũ, luôn set group.status='checked-out' vô điều kiện,
// đây là root cause của bug group 48f21f9b) bằng 2 RPC mới theo isLastActiveBooking.
//
// SỬA (v2): coi `{}` hoặc response thiếu field `ok` là THÀNH CÔNG — giờ bắt buộc
// `result.ok === true` tường minh.
//
// SỬA (v3): CheckoutPayload chuyển sang discriminated union (giống useCheckoutBooking.ts ở
// luồng Booking Detail) — trước đây expectedGroupGrandTotal/expectedGroupPaid là optional +
// chỉ validate ở runtime, nên tuyên bố "bắt buộc compile-time" chỉ đúng cho một luồng. Giờ cả
// 2 luồng (Dashboard + Booking Detail) đều dùng cùng pattern: isLastActiveBooking=true bắt buộc
// 2 field ngay ở TypeScript, không chỉ throw lúc chạy.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import type { PaymentMethod } from '@/types/database'
import { normalizeError } from '@/shared/utils/normalizeError'

type CheckoutPayloadNotLast = {
  groupId: string
  bookingId: string
  isLastActiveBooking: false
  paymentAmount: number
}

type CheckoutPayloadLast = {
  groupId: string
  bookingId: string
  isLastActiveBooking: true
  paymentAmount: number
  paymentMethod?: PaymentMethod
  note?: string
  /** Từ dashboard_today.group_grand_total — BẮT BUỘC ở compile-time khi isLastActiveBooking=true */
  expectedGroupGrandTotal: number
  /** Từ dashboard_today.paid — BẮT BUỘC ở compile-time khi isLastActiveBooking=true */
  expectedGroupPaid: number
}

export type CheckoutPayload = CheckoutPayloadNotLast | CheckoutPayloadLast

type CheckoutRpcResponse = {
  ok?: boolean
  booking_id?: string
  group_id?: string
  group_closed?: boolean
}

async function checkoutBooking(payload: CheckoutPayload): Promise<void> {
  const { bookingId } = payload

  if (!bookingId) {
    throw new Error('Thiếu booking_id để check-out')
  }

  try {
    if (payload.isLastActiveBooking) {
      // TypeScript đã enforce expectedGroupGrandTotal/expectedGroupPaid là number bắt buộc
      // (discriminated union) — không còn cần validate runtime undefined ở đây.
      const { data, error } = await supabase.rpc('checkout_last_booking_and_settle_txn', {
        p_booking_id: bookingId,
        p_expected_group_grand_total: payload.expectedGroupGrandTotal,
        p_expected_group_paid: payload.expectedGroupPaid,
        p_payment_method: payload.paymentAmount > 0 ? (payload.paymentMethod ?? null) : null,
        p_note: payload.note ?? null,
      })

      if (error) {
        if (error.code === 'P0035' || error.message?.includes('STALE_GROUP_BALANCE')) {
          throw new Error('Số dư của đoàn đã thay đổi. Vui lòng đóng và mở lại để xem số mới nhất trước khi thu.')
        }
        if (error.code === 'P0036' || error.message?.includes('STALE_BOOKING')) {
          throw new Error('Booking đã thay đổi. Vui lòng đóng và mở lại.')
        }
        throw error
      }

      const result = (data ?? {}) as CheckoutRpcResponse
      if (result.ok !== true) {
        throw new Error('Checkout thất bại — phản hồi RPC không hợp lệ')
      }

      return
    }

    const { data, error } = await supabase.rpc('checkout_single_booking_txn', {
      p_booking_id: bookingId,
    })

    if (error) {
      throw error
    }

    const result = (data ?? {}) as CheckoutRpcResponse
    if (result.ok !== true) {
      throw new Error('Checkout thất bại — phản hồi RPC không hợp lệ')
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

// Hook check-out theo booking, tự chọn RPC atomic theo isLastActiveBooking,
// đồng bộ lại các query liên quan.
export function useCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CheckoutPayload) => {
      await checkoutBooking(input)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings-list'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        queryClient.invalidateQueries({ queryKey: ['todayBookings'] }),
        queryClient.invalidateQueries({ queryKey: ['roomMap'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-folio'] }),
      ])
    },
  })
}
