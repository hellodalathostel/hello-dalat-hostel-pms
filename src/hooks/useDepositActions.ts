// Hook xử lý nhập cọc — dùng record_payment_txn RPC
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { message } from 'antd'

type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other' | 'momo' | 'zalopay'

interface DepositPayload {
  groupId: string
  amount: number
  method: PaymentMethod
  note?: string
  firstBookingId?: string
}

export function useDepositActions(bookingId: string) {
  const queryClient = useQueryClient()

  const addDeposit = useMutation({
    mutationFn: async (payload: DepositPayload) => {
      const { data, error } = await supabase.rpc('record_payment_txn', {
        p_group_id: payload.groupId,
        p_amount: payload.amount,
        p_method: payload.method,
        p_note: payload.note ?? null,
        p_first_booking_id: payload.firstBookingId ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      message.success('Đã ghi nhận cọc')
      // Invalidate folio + group + bookings list
      queryClient.invalidateQueries({ queryKey: ['booking-folio', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
    onError: (err: Error) => {
      message.error(`Lỗi ghi cọc: ${err.message}`)
    },
  })

  // Xóa payment_history row trực tiếp (RLS auth_write = ALL)
  const deleteDeposit = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from('payment_history')
        .delete()
        .eq('id', paymentId)
      if (error) throw error
    },
    onSuccess: () => {
      message.success('Đã xóa khoản cọc')
      queryClient.invalidateQueries({ queryKey: ['booking-folio', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
    onError: (err: Error) => {
      message.error(`Lỗi xóa cọc: ${err.message}`)
    },
  })

  return { addDeposit, deleteDeposit }
}
