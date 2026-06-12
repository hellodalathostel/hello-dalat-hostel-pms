import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { supabase } from '@/api/supabase'

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

interface CheckRoomAvailabilityResult {
  available: boolean
}

interface CreateGroupBookingTxnResult {
  success: boolean
  error?: string
  group_id?: string
  booking_ids?: string[]
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

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string, reason?: string }) => {
      const { error } = await supabase
        .from('booking_requests')
        .update({ status: 'rejected', rejected_reason: reason ?? null })
        .eq('id', id)

      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingRequestKeys.all })
      queryClient.invalidateQueries({ queryKey: bookingRequestKeys.pendingCount })
      message.success('Đã từ chối yêu cầu')
    },
    onError: () => {
      message.error('Không thể cập nhật, thử lại')
    },
  })
}


export function useConvertRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      request,
      pricePerNight,
    }: {
      request: BookingRequest,
      pricePerNight: number,
    }) => {
      const { data: availabilityData, error: availabilityError } = await supabase.rpc(
        'check_room_availability',
        {
          p_room_id: request.room_id,
          p_check_in: request.check_in,
          p_check_out: request.check_out,
          p_exclude_booking_id: null,
        },
      )

      if (availabilityError) {
        throw availabilityError
      }

      const isAvailable = typeof availabilityData === 'boolean'
        ? availabilityData
        : Boolean((availabilityData as CheckRoomAvailabilityResult | null)?.available)

      if (!isAvailable) {
        throw new Error('CONFLICT')
      }

      const { data: bookingData, error: bookingError } = await supabase.rpc(
        'create_group_booking_txn',
        {
          p_group: {
            customer_name: request.name,
            customer_phone: request.phone,
            customer_note: `Convert từ booking request ${request.id}`,
            customer_cccd: '',
            source: 'Walk-in',
            channel_fee_rate: 0,
          },
          p_bookings: [
            {
              room_id: request.room_id,
              check_in: request.check_in,
              check_out: request.check_out,
              price_per_night: pricePerNight,
              guest_name: request.name,
              guests_count: 1,
              note: request.note ?? '',
            },
          ],
          p_services: null,
          p_discounts: null,
        },
      )

      if (bookingError) {
        throw bookingError
      }

      const bookingResult = bookingData as CreateGroupBookingTxnResult | null
      if (!bookingResult?.success) {
        throw new Error(bookingResult?.error ?? 'create_group_booking_txn thất bại')
      }

      const groupId = bookingResult.group_id
      if (!groupId) {
        throw new Error('Thiếu group_id từ create_group_booking_txn')
      }

      const { error: updateError } = await supabase
        .from('booking_requests')
        .update({
          status: 'confirmed',
          converted_group_id: groupId,
        })
        .eq('id', request.id)

      if (updateError) {
        throw updateError
      }

      return groupId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingRequestKeys.all })
      queryClient.invalidateQueries({ queryKey: bookingRequestKeys.pendingCount })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
      message.success('Đã tạo booking thành công!')
    },
    onError: (error: Error) => {
      if (error.message === 'CONFLICT') {
        message.error('Phòng đã có booking trùng lịch, hãy từ chối request hoặc đổi phòng khác')
        return
      }

      message.error('Không thể tạo booking, thử lại')
    },
  })
}
