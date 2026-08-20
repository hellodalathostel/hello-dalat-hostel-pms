import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

interface UpdateBreakfastParams {
  bookingId: string
  groupId: string
  hasBreakfast: boolean
  breakfastType: 'free' | 'paid' | null
  qtyPerNight: number
}

export function useUpdateBookingBreakfast() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationKey: ['update-booking-breakfast'],
    mutationFn: async ({ bookingId, hasBreakfast, breakfastType, qtyPerNight }: UpdateBreakfastParams) => {
      try {
        const { data, error } = await supabase.rpc('update_booking_breakfast_txn', {
          p_booking_id: bookingId,
          p_has_breakfast: hasBreakfast,
          p_breakfast_type: breakfastType,
          p_qty_per_night: qtyPerNight,
        })

        if (error) {
          throw error
        }

        return data
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['booking-detail', variables.groupId] })
      message.success('Đã cập nhật ăn sáng')
    },
    onError: (error: Error) => {
      message.error(error.message)
    },
  })
}
