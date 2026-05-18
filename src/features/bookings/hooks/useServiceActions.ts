// Hook CRUD booking_services — trigger tự recalc grand_total
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { message } from 'antd'

interface AddServicePayload {
  bookingId: string
  serviceId?: string   // null nếu nhập tay
  name: string
  price: number
  qty: number
}

export function useServiceActions(bookingId: string, groupId: string) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['booking-folio', bookingId] })
    queryClient.invalidateQueries({ queryKey: ['booking-detail', groupId] })
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
  }

  const addService = useMutation({
    mutationFn: async (payload: AddServicePayload) => {
      const { error } = await supabase.from('booking_services').insert({
        booking_id: payload.bookingId,
        service_id: payload.serviceId ?? null,
        name: payload.name,
        price: payload.price,
        qty: payload.qty,
      })
      if (error) throw error
    },
    onSuccess: () => { message.success('Đã thêm dịch vụ'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi thêm dịch vụ: ${err.message}`) },
  })

  const deleteService = useMutation({
    mutationFn: async (serviceRowId: string) => {
      const { error } = await supabase
        .from('booking_services')
        .delete()
        .eq('id', serviceRowId)
      if (error) throw error
    },
    onSuccess: () => { message.success('Đã xóa dịch vụ'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi xóa dịch vụ: ${err.message}`) },
  })

  return { addService, deleteService }
}
