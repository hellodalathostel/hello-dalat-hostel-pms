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

export interface CheckoutParams {
  bookingId: string
}

type RecordPaymentResult = {
  success: boolean
  surcharge_amount: number
  card_fee_applied: boolean
}

type CheckoutResult = {
  success: boolean
  checked_out_at: string
}

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
        queryClient.invalidateQueries({ queryKey: ['booking-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
      ])
    },
    onError: (error: Error) => {
      message.error(`Lỗi ghi payment: ${error.message}`)
    },
  })
}

export function useCheckoutBooking() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (params: CheckoutParams): Promise<CheckoutResult> => {
      try {
        const { data, error } = await supabase.rpc('checkout_booking_txn', {
          p_booking_id: params.bookingId,
        })

        if (error) {
          throw error
        }

        return (data ?? { success: false, checked_out_at: '' }) as CheckoutResult
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rooms'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['todayBookings'] }),
        queryClient.invalidateQueries({ queryKey: ['roomMap'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-detail'] }),
      ])
    },
    onError: (error: Error) => {
      message.error(`Lỗi checkout: ${error.message}`)
    },
  })
}
