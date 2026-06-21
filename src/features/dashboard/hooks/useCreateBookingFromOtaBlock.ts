import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface OtaBlockBookingPayload {
  ical_uid: string
  room_id: string
  check_in: string
  check_out: string
  customer_name: string
  customer_phone?: string
  price_per_night: number
  guests_count?: number
  source?: string
}

interface CreateBookingFromOtaBlockRpcPayload {
  p_group: {
    customer_name: string
    customer_phone: string | null
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
    external_ical_uid: string
  }>
  p_services: null
  p_discounts: null
}

interface CreateBookingFromOtaBlockResult {
  success: boolean
  error?: string
  group_id?: string
  booking_ids?: string[]
}

async function createBookingFromOtaBlockMutationFn(
  payload: OtaBlockBookingPayload,
): Promise<CreateBookingFromOtaBlockResult> {
  try {
    const normalizedPayload: CreateBookingFromOtaBlockRpcPayload = {
      p_group: {
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone?.trim() ? payload.customer_phone.trim() : null,
        source: 'Booking.com',
        channel_fee_rate: 0.17,
      },
      p_bookings: [
        {
          room_id: payload.room_id,
          check_in: payload.check_in,
          check_out: payload.check_out,
          price_per_night: payload.price_per_night,
          guest_name: payload.customer_name,
          guests_count: payload.guests_count ?? 1,
          note: '',
          external_ical_uid: payload.ical_uid,
        },
      ],
      p_services: null,
      p_discounts: null,
    }

    const { data, error } = await supabase.rpc('create_group_booking_txn', normalizedPayload)

    if (error) {
      throw error
    }

    const result = data as CreateBookingFromOtaBlockResult | null

    if (!result?.success) {
      throw new Error(result?.error ?? 'create_group_booking_txn thất bại')
    }

    return result
  } catch (error) {
    throw normalizeError(error)
  }
}

export function useCreateBookingFromOtaBlock() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationKey: ['create-booking-from-ota-block'],
    mutationFn: createBookingFromOtaBlockMutationFn,
    onSuccess: (_result, variables) => {
      message.success('Đã tạo booking từ OTA block')
      void queryClient.invalidateQueries({ queryKey: ['ota-blocks', variables.room_id] })
      void queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
      void queryClient.invalidateQueries({ queryKey: ['bookings'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    onError: (error) => {
      const normalizedError = normalizeError(error)
      message.error(`Tạo booking thất bại: ${normalizedError.message}`)
    },
  })
}