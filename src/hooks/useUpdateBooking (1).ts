import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface UpdateBookingPayload {
  bookingId: string
  groupId: string       // Để invalidate đúng query key
  roomId?: string
  checkIn?: string      // YYYY-MM-DD
  checkOut?: string     // YYYY-MM-DD
  price?: number
  guestsCount?: number
  guestName?: string
  note?: string
}

export interface CancelBookingPayload {
  bookingId: string
  groupId: string
}

// Hook sửa thông tin booking (ngày, phòng, giá, ghi chú).
export function useUpdateBooking() {
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['update-booking'],
    mutationFn: async (payload: UpdateBookingPayload) => {
      try {
        const { data, error } = await supabase.rpc('update_booking_txn', {
          p_booking_id:   payload.bookingId,
          p_room_id:      payload.roomId      ?? null,
          p_check_in:     payload.checkIn     ?? null,
          p_check_out:    payload.checkOut    ?? null,
          p_price:        payload.price       ?? null,
          p_guests_count: payload.guestsCount ?? null,
          p_guest_name:   payload.guestName   ?? null,
          p_note:         payload.note        ?? null,
          p_status:       null,
        })
        if (error) throw error
        return data
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async (_data, variables) => {
      // Làm mới detail drawer + calendar
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['booking-detail', variables.groupId] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
      ])
    },
    onError: (error) => {
      const normalized = normalizeError(error)
      notification.error({
        message: 'Không thể cập nhật booking',
        description: normalized.message,
      })
    },
  })
}

// Hook huỷ booking (status → cancelled).
export function useCancelBooking() {
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['cancel-booking'],
    mutationFn: async (payload: CancelBookingPayload) => {
      try {
        const { data, error } = await supabase.rpc('update_booking_txn', {
          p_booking_id:   payload.bookingId,
          p_room_id:      null,
          p_check_in:     null,
          p_check_out:    null,
          p_price:        null,
          p_guests_count: null,
          p_guest_name:   null,
          p_note:         null,
          p_status:       'cancelled',
        })
        if (error) throw error
        return data
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['booking-detail', variables.groupId] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
      ])
    },
    onError: (error) => {
      const normalized = normalizeError(error)
      notification.error({
        message: 'Không thể huỷ booking',
        description: normalized.message,
      })
    },
  })
}
