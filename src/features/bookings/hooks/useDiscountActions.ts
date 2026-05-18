// Hook CRUD booking_discounts — trigger tự recalc grand_total
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { message } from 'antd'

interface AddDiscountPayload {
  bookingId: string
  amount: number
  description?: string
}

export function useDiscountActions(bookingId: string, groupId: string) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['booking-folio', bookingId] })
    queryClient.invalidateQueries({ queryKey: ['booking-detail', groupId] })
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
  }

  const addDiscount = useMutation({
    mutationFn: async (payload: AddDiscountPayload) => {
      const { error } = await supabase.from('booking_discounts').insert({
        booking_id: payload.bookingId,
        amount: payload.amount,
        description: payload.description ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => { message.success('Đã thêm giảm giá'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi thêm giảm giá: ${err.message}`) },
  })

  const deleteDiscount = useMutation({
    mutationFn: async (discountId: string) => {
      const { error } = await supabase
        .from('booking_discounts')
        .delete()
        .eq('id', discountId)
      if (error) throw error
    },
    onSuccess: () => { message.success('Đã xóa giảm giá'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi xóa giảm giá: ${err.message}`) },
  })

  return { addDiscount, deleteDiscount }
}
