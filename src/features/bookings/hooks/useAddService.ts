import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

// Loại dịch vụ: own = doanh thu HKD, partner = đối tác (không tính S1a)
export type ServiceType = 'own' | 'partner'

// Catalog service từ bảng services (có thêm service_type)
export interface ServiceCatalogItem {
  id: string
  name: string
  price: number
  service_type: ServiceType
}

// Params cho RPC add_booking_service_txn
interface AddServiceParams {
  bookingId: string
  serviceId?: string
  qty: number
  customName?: string
  customPrice?: number
}

interface AddServiceRpcResult {
  service?: string
  qty?: number
}

// Query key để fetch catalog
export const SERVICE_CATALOG_KEY = ['service-catalog'] as const

// Hook fetch catalog (dùng trong modal) — include service_type
export function useServiceCatalog() {
  return useQuery({
    queryKey: SERVICE_CATALOG_KEY,
    queryFn: async (): Promise<ServiceCatalogItem[]> => {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price, service_type')
        .eq('is_deleted', false)
        .order('name')

      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

// Hook mutation thêm dịch vụ
export function useAddService(bookingId: string) {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (params: Omit<AddServiceParams, 'bookingId'>) => {
      const { data, error } = await supabase.rpc('add_booking_service_txn', {
        p_booking_id: bookingId,
        p_service_id: params.serviceId ?? null,
        p_qty: params.qty,
        p_custom_name: params.customName ?? null,
        p_custom_price: params.customPrice ?? null,
      })

      if (error) throw error

      const result = Array.isArray(data) ? data[0] : data
      return (result as AddServiceRpcResult | null) ?? null
    },
    onSuccess: (data) => {
      message.success(`Đã thêm: ${data?.service ?? 'dịch vụ'} ×${data?.qty ?? 0}`)
      void queryClient.invalidateQueries({ queryKey: ['booking-folio', bookingId] })
      void queryClient.invalidateQueries({ queryKey: ['booking-detail', bookingId] })
    },
    onError: (error: Error) => {
      const msg = error.message ?? ''
      if (msg.includes('BOOKING_INVALID_STATUS')) {
        message.error('Chỉ thêm dịch vụ khi booking đang confirmed hoặc checked-in.')
      } else if (msg.includes('SERVICE_NOT_FOUND')) {
        message.error('Dịch vụ không tồn tại hoặc đã bị xóa.')
      } else if (msg.includes('INVALID_QTY')) {
        message.error('Số lượng phải lớn hơn 0.')
      } else {
        message.error('Thêm dịch vụ thất bại. Vui lòng thử lại.')
      }
    },
  })
}
