import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { GuestCheckInPayload } from '@/lib/schemas/checkInOut'

export interface CheckInPayload {
  customer_cccd: string
  ho_va_ten?: string
  ngay_sinh?: string | null
  gioi_tinh?: string
  quoc_tich?: string
  loai_giay_to?: string
  ten_giay_to?: string
  so_giay_to?: string
  so_dien_thoai?: string
  dia_chi_chi_tiet?: string
}

export interface OcrScanPayload {
  data: string
  mime_type: string
}

async function invalidateOperationalQueries(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
    queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
  ])
}

export function useOcrScan() {
  const { notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['ocr-id-scan'],
    mutationFn: async (images: OcrScanPayload[]): Promise<GuestCheckInPayload[]> => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          throw new Error('Chưa đăng nhập')
        }

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkin-processor`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ images }),
          }
        )

        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as Record<string, unknown>
          const errorMessage =
            typeof err.message === 'string'
              ? err.message
              : `OCR thất bại (${res.status})`
          throw new Error(errorMessage)
        }

        const result = await res.json()
        return Array.isArray(result)
          ? (result as GuestCheckInPayload[])
          : [result as GuestCheckInPayload]
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onError: (error) => {
      const normalizedError = normalizeError(error)
      notification.error({
        message: 'Không thể quét CCCD/Passport',
        description: normalizedError.message,
      })
    },
  })
}

export function useCheckIn(bookingId: string) {
  const queryClient = useQueryClient()
  const { message, notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['booking-check-in', bookingId],
    mutationFn: async (payload: CheckInPayload) => {
      try {
        const { error } = await supabase.rpc('check_in_guest', {
          p_booking_id: bookingId,
          p_customer_cccd: payload.customer_cccd.trim(),
          p_guest_payload: payload,
        })

        if (error) {
          throw error
        }
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async () => {
      await invalidateOperationalQueries(queryClient)
      message.success('Check-in thành công')
    },
    onError: (error) => {
      const normalizedError = normalizeError(error)
      notification.error({
        message: 'Không thể check-in booking',
        description: normalizedError.message,
      })
    },
  })
}
