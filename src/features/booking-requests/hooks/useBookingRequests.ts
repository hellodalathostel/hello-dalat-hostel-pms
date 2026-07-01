import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

export type BookingRequestStatus = 'pending' | 'confirmed' | 'rejected'

export interface BookingRequest {
  id: string
  name: string
  phone: string
  email: string | null
  room_id: string
  check_in: string
  check_out: string
  note: string | null
  status: BookingRequestStatus
  rejected_reason: string | null
  converted_group_id: string | null
  created_at: string
  updated_at: string
}

interface ConfirmBookingRequestTxnResult {
  success: boolean
  error?: string
  group_id?: string
  booking_id?: string
}

const bookingRequestKeys = {
  all: ['booking-requests'] as const,
  pendingCount: ['booking-requests-pending-count'] as const,
}

// Query danh sách tất cả booking requests.
export function useBookingRequests() {
  return useQuery({
    queryKey: bookingRequestKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      return (data ?? []) as BookingRequest[]
    },
  })
}

// Query count pending để hiển thị badge ở sidebar.
export function usePendingRequestCount() {
  return useQuery({
    queryKey: bookingRequestKeys.pendingCount,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('booking_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')

      if (error) {
        throw error
      }

      return count ?? 0
    },
    refetchInterval: 60_000,
  })
}

export function useRejectRequest() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string, reason?: string }) => {
      try {
        const { error } = await supabase
          .from('booking_requests')
          .update({ status: 'rejected', rejected_reason: reason ?? null })
          .eq('id', id)

        if (error) {
          throw error
        }
      } catch (err) {
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi từ chối yêu cầu')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingRequestKeys.all })
      queryClient.invalidateQueries({ queryKey: bookingRequestKeys.pendingCount })
      message.success('Đã từ chối yêu cầu')
    },
    onError: (err: Error) => {
      message.error(`Không thể cập nhật: ${err.message}`)
    },
  })
}


export function useConvertRequest() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async ({
      request,
      pricePerNight,
    }: {
      request: BookingRequest,
      pricePerNight: number,
    }) => {
      try {
        const { data, error } = await supabase.rpc('confirm_booking_request_txn', {
          p_request_id: request.id,
          p_price_per_night: pricePerNight,
        })

        if (error) {
          throw error
        }

        const result = data as ConfirmBookingRequestTxnResult | null
        if (!result?.success) {
          throw new Error(result?.error ?? 'confirm_booking_request_txn thất bại')
        }

        return result.group_id
      } catch (err) {
        throw err instanceof Error ? err : new Error('Lỗi không xác định khi tạo booking')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingRequestKeys.all })
      queryClient.invalidateQueries({ queryKey: bookingRequestKeys.pendingCount })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
      message.success('Đã tạo booking thành công!')
    },
    onError: (error: Error) => {
      if (error.message.includes('ROOM_CONFLICT')) {
        message.error('Phòng đã có booking trùng lịch, hãy từ chối request hoặc đổi phòng khác')
        return
      }
      if (error.message.includes('REQUEST_ALREADY_PROCESSED')) {
        message.error('Request này đã được xử lý trước đó')
        return
      }

      message.error('Không thể tạo booking, thử lại')
    },
  })
}
