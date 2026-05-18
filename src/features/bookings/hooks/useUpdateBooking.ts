import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Dayjs } from 'dayjs'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface UpdateBookingPayload {
  bookingId: string
  roomId?: string
  checkIn?: Dayjs
  checkOut?: Dayjs
  pricePerNight?: number
  guestsCount?: number
  guestName?: string
  note?: string
}

async function invalidateOperationalQueries(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['booking-detail'] }),
    queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
  ])
}

export function useUpdateBooking() {
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['update-booking-txn'],
    mutationFn: async (payload: UpdateBookingPayload) => {
      try {
        const { data, error } = await supabase.rpc('update_booking_txn', {
          p_booking_id: payload.bookingId,
          p_room_id: payload.roomId,
          p_check_in: payload.checkIn?.format('YYYY-MM-DD'),
          p_check_out: payload.checkOut?.format('YYYY-MM-DD'),
          p_price_per_night: payload.pricePerNight,
          p_guests_count: payload.guestsCount,
          p_guest_name: payload.guestName,
          p_note: payload.note,
        })

        if (error) {
          throw error
        }

        return data
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async () => {
      await invalidateOperationalQueries(queryClient)
    },
    onError: (error) => {
      const normalizedError = normalizeError(error)
      notification.error({
        message: 'Khong the cap nhat booking',
        description: normalizedError.message,
      })
    },
  })
}

export function useCancelBooking() {
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['cancel-booking-txn'],
    mutationFn: async (bookingId: string) => {
      try {
        const { data, error } = await supabase.rpc('update_booking_txn', {
          p_booking_id: bookingId,
          p_cancel: true,
        })

        if (error) {
          throw error
        }

        return data
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async () => {
      await invalidateOperationalQueries(queryClient)
    },
    onError: (error) => {
      const normalizedError = normalizeError(error)
      notification.error({
        message: 'Khong the huy booking',
        description: normalizedError.message,
      })
    },
  })
}
