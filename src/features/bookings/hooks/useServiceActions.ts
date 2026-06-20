// FILE: src/features/bookings/hooks/useServiceActions.ts
// Hook CRUD booking_services qua RPC — trigger tự recalc grand_total
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

interface AddServicePayload {
  bookingId: string
  serviceId?: string   // null nếu nhập tay
  name?: string        // chỉ dùng khi serviceId null (custom)
  price?: number        // chỉ dùng khi serviceId null (custom)
  qty: number
}

export function useServiceActions(bookingId: string, groupId: string) {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['booking-folio', bookingId] })
    queryClient.invalidateQueries({ queryKey: ['booking-detail', groupId] })
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
  }

  const addService = useMutation({
    mutationFn: async (payload: AddServicePayload) => {
      try {
        const { data, error } = await supabase.rpc('add_booking_service_txn', {
          p_booking_id: payload.bookingId,
          p_service_id: payload.serviceId ?? null,
          p_qty: payload.qty,
          p_custom_name: payload.serviceId ? null : payload.name,
          p_custom_price: payload.serviceId ? null : payload.price,
        })
        if (error) throw error
        return data
      } catch (err) {
        // Bắt cả lỗi network/parsing ngoài error field của Supabase response
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi thêm dịch vụ')
      }
    },
    onSuccess: () => { message.success('Đã thêm dịch vụ'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi thêm dịch vụ: ${err.message}`) },
  })

  const deleteService = useMutation({
    mutationFn: async (serviceRowId: string) => {
      try {
        const { error } = await supabase.rpc('delete_booking_service_txn', {
          p_service_row_id: serviceRowId,
        })
        if (error) throw error
      } catch (err) {
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi xóa dịch vụ')
      }
    },
    onSuccess: () => { message.success('Đã xóa dịch vụ'); invalidate() },
    onError: (err: Error) => { message.error(`Lỗi xóa dịch vụ: ${err.message}`) },
  })

  return { addService, deleteService }
}
