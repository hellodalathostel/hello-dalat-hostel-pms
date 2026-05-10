import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import type { PaymentMethod } from '@/types/database'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface CheckoutPayload {
  groupId: string
  bookingIds: string[]
  paymentAmount: number
  paymentMethod?: PaymentMethod
  note?: string
}

type CheckoutRpcResponse = {
  ok?: boolean
  success?: boolean
}

async function checkoutGroup(payload: CheckoutPayload): Promise<void> {
  const { groupId, bookingIds, paymentAmount, paymentMethod, note } = payload

  if (!groupId) {
    throw new Error('Thiếu group_id để check-out')
  }

  if (bookingIds.length === 0) {
    throw new Error('Thiếu danh sách booking để check-out')
  }

  try {
    const { data, error } = await supabase.rpc('checkout_group_txn', {
      p_group_id: groupId,
      p_booking_ids: bookingIds,
      p_payment_amount: paymentAmount,
      p_payment_method: paymentAmount > 0 ? (paymentMethod ?? null) : null,
      p_note: note ?? null,
    })

    if (error) {
      throw error
    }

    const result = (data ?? {}) as CheckoutRpcResponse
    if (result.ok === false || result.success === false) {
      throw new Error('Checkout thất bại')
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

// Hook check-out theo group transaction, đồng bộ lại các query liên quan.
export function useCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CheckoutPayload) => {
      await checkoutGroup(input)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        queryClient.invalidateQueries({ queryKey: ['todayBookings'] }),
        queryClient.invalidateQueries({ queryKey: ['roomMap'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-detail'] }),
      ])
    },
  })
}
