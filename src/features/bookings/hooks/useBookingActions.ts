// src/hooks/useBookingActions.ts
// Hook xử lý check-in / check-out mutation — dùng chung toàn app

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { supabase } from '@/api/supabase'

interface BookingActionResult {
  success: boolean
  error?: string
  booking_id?: string
}

// Gọi RPC process_checkin
async function callCheckin(bookingId: string): Promise<BookingActionResult> {
  const { data, error } = await supabase.rpc('process_checkin', {
    p_booking_id: bookingId,
  })
  if (error) throw new Error(error.message)
  return data as BookingActionResult
}

// Gọi RPC process_checkout
async function callCheckout(bookingId: string): Promise<BookingActionResult> {
  const { data, error } = await supabase.rpc('process_checkout', {
    p_booking_id: bookingId,
  })
  if (error) throw new Error(error.message)
  return data as BookingActionResult
}

// Invalidate keys liên quan sau mutation
const INVALIDATE_KEYS = [
  ['dashboard', 'today'],
  ['room-calendar'],
]

export function useCheckinMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: callCheckin,
    onSuccess: (result) => {
      if (!result.success) {
        message.error(result.error ?? 'Check-in thất bại')
        return
      }
      message.success('Check-in thành công!')
      INVALIDATE_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }))
    },
    onError: (err: Error) => {
      message.error(`Lỗi: ${err.message}`)
    },
  })
}

export function useCheckoutMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: callCheckout,
    onSuccess: (result) => {
      if (!result.success) {
        message.error(result.error ?? 'Check-out thất bại')
        return
      }
      message.success('Check-out thành công!')
      INVALIDATE_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }))
    },
    onError: (err: Error) => {
      message.error(`Lỗi: ${err.message}`)
    },
  })
}
