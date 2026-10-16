// FILE: src/features/bookings/hooks/useServiceActions.ts
// Hook CRUD booking_services qua RPC — trigger tự recalc grand_total
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { useRefreshBookingData } from '@/shared/hooks/useRefreshBookingData'

interface AddServicePayload {
  bookingId: string
  serviceId?: string   // null nếu nhập tay
  name?: string        // chỉ dùng khi serviceId null (custom)
  price?: number        // chỉ dùng khi serviceId null (custom)
  qty: number
}

export function useServiceActions() {
  const { message } = useAppFeedback()
  // Tải lại folio + drawer + danh sách sau mỗi thao tác (B-03)
  const invalidate = useRefreshBookingData()

  const addService = useMutation({
    mutationFn: async (payload: AddServicePayload) => {
      try {
        const { data, error } = await supabase.rpc('add_booking_service_txn', {
          p_booking_id: payload.bookingId,
          p_service_id: payload.serviceId ?? null,
          p_qty: payload.qty,
          // p_custom_name chỉ cần khi KHÔNG có serviceId (dịch vụ custom hoàn toàn)
          p_custom_name: payload.serviceId ? null : payload.name,
          // Luôn forward payload.price nếu có — RPC tự ưu tiên dùng giá này để
          // override giá catalog khi có p_service_id.
          p_custom_price: payload.price ?? null,
        })
        if (error) throw error
        return data
      } catch (err) {
        // Bắt cả lỗi network/parsing ngoài error field của Supabase response
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi thêm dịch vụ')
      }
    },
    onSuccess: () => { message.success('Đã thêm dịch vụ'); void invalidate() },
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
    onSuccess: () => { message.success('Đã xóa dịch vụ'); void invalidate() },
    onError: (err: Error) => { message.error(`Lỗi xóa dịch vụ: ${err.message}`) },
  })

  return { addService, deleteService }
}
