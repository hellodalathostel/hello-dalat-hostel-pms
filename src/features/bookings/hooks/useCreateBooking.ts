import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { NewBookingFormValues } from '@/lib/schemas'
import type { DepositInput, DiscountLineItem, ServiceLineItem } from '@/features/bookings/types/booking'

interface CreateBookingRpcPayload {
  p_group: {
    customer_name: string
    customer_phone: string
    customer_note: string
    customer_cccd: string
    source: string
    channel_fee_rate: number
  }
  p_bookings: Array<{
    room_id: string
    check_in: string
    check_out: string
    price_per_night: number
    guest_name: string
    guests_count: number
    note: string
  }>
  p_services: Array<{
    service_id: string
    qty: number
    booking_index: number
  }> | null
  p_discounts: Array<{
    amount: number
    description: string
    booking_index: number
  }> | null
}

interface CreateBookingMutationInput {
  values: NewBookingFormValues
  services?: ServiceLineItem[]
  discounts?: DiscountLineItem[]
  deposit?: DepositInput | null
}

interface CreateBookingRpcResult {
  success: boolean
  error?: string
  group_id?: string
  booking_ids?: string[]
}

interface RecordPaymentRpcResult {
  success: boolean
  error?: string
}

async function createBookingMutationFn(input: CreateBookingMutationInput): Promise<CreateBookingRpcResult> {
  try {
    const { values, services = [], discounts = [], deposit = null } = input
    const maxBookingIndex = Math.max(values.bookings.length - 1, 0)
    const normalizedServices = services
      .filter((service) => service.service_id.trim() !== '' && service.qty > 0)
      .map((service) => ({
        service_id: service.service_id,
        qty: service.qty,
        booking_index: Math.min(Math.max(service.booking_index, 0), maxBookingIndex),
        price: service.price,
      }))

    const normalizedDiscounts = discounts
      .filter((discount) => discount.amount > 0)
      .map((discount) => ({
        amount: discount.amount,
        description: discount.description,
        booking_index: Math.min(Math.max(discount.booking_index, 0), maxBookingIndex),
      }))

    const payload: CreateBookingRpcPayload = {
      p_group: {
        customer_name: values.customer_name,
        customer_phone: values.customer_phone ?? '',
        customer_note: values.customer_note ?? '',
        customer_cccd: values.customer_cccd ?? '',
        source: values.source,
        channel_fee_rate: values.channel_fee_rate,
      },
      p_bookings: values.bookings.map((booking) => ({
        room_id: booking.room_id,
        check_in: booking.check_in.format('YYYY-MM-DD'),
        check_out: booking.check_out.format('YYYY-MM-DD'),
        price_per_night: booking.price_per_night,
        guest_name: booking.guest_name ?? '',
        guests_count: booking.guests_count,
        note: booking.note ?? '',
      })),
      p_services:
        normalizedServices.length > 0
          ? normalizedServices.map((service) => ({
              service_id: service.service_id,
              qty: service.qty,
              booking_index: service.booking_index,
              // Forward giá đã sửa tay trên ServiceSection — RPC đã hỗ trợ override
              custom_price: service.price,
            }))
          : null,
      p_discounts:
        normalizedDiscounts.length > 0
          ? normalizedDiscounts.map((discount) => ({
              amount: discount.amount,
              description: discount.description,
              booking_index: discount.booking_index,
            }))
          : null,
    }

    const { data, error } = await supabase.rpc('create_group_booking_txn', payload)

    if (error) {
      throw error
    }

    const result = data as CreateBookingRpcResult | null

    if (!result?.success) {
      throw new Error(result?.error ?? 'create_group_booking_txn thất bại')
    }

    if (deposit && deposit.amount > 0) {
      if (!result.group_id) {
        throw new Error('Thiếu group_id từ create_group_booking_txn')
      }

      const firstBookingId = result.booking_ids?.[0] ?? null
      if (deposit.method === 'card' && !firstBookingId) {
        throw new Error('Thiếu booking_id đầu tiên để ghi nhận thanh toán thẻ')
      }

      const { data: paymentData, error: paymentError } = await supabase.rpc('record_payment_txn', {
        p_group_id: result.group_id,
        p_amount: deposit.amount,
        p_method: deposit.method,
        p_note: deposit.note ?? '',
        p_first_booking_id: deposit.method === 'card' ? firstBookingId : null,
      })

      if (paymentError) {
        throw paymentError
      }

      const paymentResult = paymentData as RecordPaymentRpcResult | null
      if (!paymentResult?.success) {
        throw new Error(paymentResult?.error ?? 'record_payment_txn thất bại')
      }
    }

    return result
  } catch (error) {
    throw normalizeError(error)
  }
}

// Hook mutation tạo group + booking mới thông qua RPC transaction ở database.
export function useCreateBooking() {
  const { notification } = useAppFeedback()
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['create-group-booking-rpc'],
    mutationFn: createBookingMutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
      ])
    },
    onError: (error) => {
      const normalizedError = normalizeError(error)
      notification.error({
        message: 'Không thể tạo booking',
        description: normalizedError.message,
      })
    },
  })
}