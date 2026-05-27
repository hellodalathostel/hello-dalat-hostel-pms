import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

interface AddServiceParams {
  bookingId: string
  serviceId?: string
  qty: number
  customName?: string
  customPrice?: number
}

interface AddBookingServiceResult {
  service?: string
  qty?: number
}

export function useAddBookingService(groupId: string) {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (params: AddServiceParams): Promise<AddBookingServiceResult | null> => {
      const { data, error } = await supabase.rpc('add_booking_service_txn', {
        p_booking_id: params.bookingId,
        p_service_id: params.serviceId ?? null,
        p_qty: params.qty,
        p_custom_name: params.customName ?? null,
        p_custom_price: params.customPrice ?? null,
      })

      if (error) {
        throw error
      }

      const result = Array.isArray(data) ? data[0] : data
      return (result as AddBookingServiceResult | null) ?? null
    },
    onSuccess: (data) => {
      const serviceName = data?.service ?? 'dịch vụ'
      const qty = data?.qty ?? 0

      message.success(`Đã thêm ${serviceName} × ${qty}`)
      void queryClient.invalidateQueries({ queryKey: ['booking-detail', groupId] })
    },
    onError: (err: Error) => {
      message.error(`Thêm dịch vụ thất bại: ${err.message}`)
    },
  })
}
