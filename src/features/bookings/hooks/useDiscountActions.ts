// FILE: src/features/bookings/hooks/useDiscountActions.ts
// Hook CRUD booking_discounts qua RPC — trigger tự recalc grand_total
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

interface AddDiscountPayload {
  bookingId: string
  amount: number
  description?: string
}

export function useDiscountActions(bookingId: string, groupId: string) {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['booking-folio', bookingId] })
    queryClient.invalidateQueries({ queryKey: ['booking-detail', groupId] })
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
  }

  const addDiscount = useMutation({
    mutationFn: async (payload: AddDiscountPayload) => {
      const { data, error } = await supabase.rpc('add_discount_txn', {
        p_booking_id: payload.bookingId,
        p_amount: payload.amount,
        p_description: payload.description ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => { message.success('Đã thêm giảm giá'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi thêm giảm giá: ${err.message}`) },
  })

  const deleteDiscount = useMutation({
    mutationFn: async (discountId: string) => {
      const { error } = await supabase.rpc('delete_booking_discount_txn', {
        p_discount_row_id: discountId,
      })
      if (error) throw error
    },
    onSuccess: () => { message.success('Đã xóa giảm giá'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi xóa giảm giá: ${err.message}`) },
  })

  return { addDiscount, deleteDiscount }
}
