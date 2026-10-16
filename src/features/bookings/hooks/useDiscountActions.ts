// FILE: src/features/bookings/hooks/useDiscountActions.ts
// Hook CRUD booking_discounts qua RPC — trigger tự recalc grand_total
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { useRefreshBookingData } from '@/shared/hooks/useRefreshBookingData'

interface AddDiscountPayload {
  bookingId: string
  amount: number
  description?: string
}

export function useDiscountActions() {
  const { message } = useAppFeedback()
  // Tải lại folio + drawer + danh sách sau mỗi thao tác (B-03)
  const invalidate = useRefreshBookingData()

  const addDiscount = useMutation({
    mutationFn: async (payload: AddDiscountPayload) => {
      try {
        const { data, error } = await supabase.rpc('add_discount_txn', {
          p_booking_id: payload.bookingId,
          p_amount: payload.amount,
          p_description: payload.description ?? null,
        })
        if (error) throw error
        return data
      } catch (err) {
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi thêm giảm giá')
      }
    },
    onSuccess: () => { message.success('Đã thêm giảm giá'); void invalidate() },
    onError: (err: Error) => { message.error(`Lỗi thêm giảm giá: ${err.message}`) },
  })

  const deleteDiscount = useMutation({
    mutationFn: async (discountId: string) => {
      try {
        const { error } = await supabase.rpc('delete_booking_discount_txn', {
          p_discount_row_id: discountId,
        })
        if (error) throw error
      } catch (err) {
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi xóa giảm giá')
      }
    },
    onSuccess: () => { message.success('Đã xóa giảm giá'); void invalidate() },
    onError: (err: Error) => { message.error(`Lỗi xóa giảm giá: ${err.message}`) },
  })

  return { addDiscount, deleteDiscount }
}
