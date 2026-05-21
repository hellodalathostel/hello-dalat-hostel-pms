import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { NewBookingFormValues } from '@/lib/schemas'

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
  p_services: null
  p_discounts: null
}

async function createBookingMutationFn(values: NewBookingFormValues): Promise<unknown> {
  try {
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
      p_services: null,
      p_discounts: null,
    }

    const { data, error } = await supabase.rpc('create_group_booking_txn', payload)

    if (error) {
      throw error
    }

    return data
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
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