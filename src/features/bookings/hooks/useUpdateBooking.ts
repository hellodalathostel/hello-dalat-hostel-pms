import { useMutation } from '@tanstack/react-query'
import type { Dayjs } from 'dayjs'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import { useRefreshBookingData } from '@/shared/hooks/useRefreshBookingData'

export interface UpdateBookingPayload {
  bookingId: string
  roomId?: string
  checkIn?: Dayjs
  checkOut?: Dayjs
  pricePerNight?: number
  guestsCount?: number
  guestName?: string
  note?: string
  overrideCheckin?: boolean
}

type UpdateBookingRpcParams = {
  p_booking_id: string
  p_room_id?: string
  p_check_in?: string
  p_check_out?: string
  p_price_per_night?: number
  p_guests_count?: number
  p_guest_name?: string
  p_note?: string
  p_override_checkin?: boolean
}

export function useUpdateBooking() {
  const refreshBookingData = useRefreshBookingData()
  const { notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['update-booking-txn'],
    mutationFn: async (payload: UpdateBookingPayload) => {
      try {
        const params: UpdateBookingRpcParams = {
          p_booking_id: payload.bookingId,
          p_room_id: payload.roomId,
          p_check_in: payload.checkIn?.format('YYYY-MM-DD'),
          p_check_out: payload.checkOut?.format('YYYY-MM-DD'),
          p_price_per_night: payload.pricePerNight,
          p_guests_count: payload.guestsCount,
          p_guest_name: payload.guestName,
          p_note: payload.note,
          p_override_checkin: payload.overrideCheckin ?? false,
        }

        const { data, error } = await supabase.rpc('update_booking_txn', params)

        if (error) {
          throw error
        }

        return data
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async () => {
      // Tải lại bảng danh sách + drawer + folio (B-02)
      await refreshBookingData()
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
  const refreshBookingData = useRefreshBookingData()
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
      // Tải lại bảng danh sách + drawer + folio (B-02)
      await refreshBookingData()
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
