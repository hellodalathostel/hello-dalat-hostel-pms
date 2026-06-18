import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { CheckinGuestPayload } from '@/types/checkin'

export type { CheckinGuestPayload }

export interface CheckinPayload {
	booking_id: string
	guests: CheckinGuestPayload[]
}

interface CheckinRpcResponse {
	success: boolean
	booking_id: string
	guests_count: number
}

// Hook check-in gọi RPC transaction và tự refresh cache liên quan.
export function useCheckIn() {
	const queryClient = useQueryClient()
	const { message } = useAppFeedback()

	return useMutation({
		mutationFn: async ({ booking_id, guests }: CheckinPayload) => {
			if (import.meta.env.DEV) {
				// Chỉ log metadata, KHÔNG log nội dung guests (chứa PII: document_number, full_name, ngày sinh)
				console.log('checkin payload:', { booking_id, guests_count: guests.length })
			}

			const { data, error } = await supabase.rpc('checkin_booking_txn', {
				p_booking_id: booking_id,
				p_guests: guests,
			})

			if (error) {
				throw new Error(error.message)
			}

			return data as CheckinRpcResponse
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
				queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
			])
			message.success('Check-in thành công')
		},
		onError: (error) => {
			const errorMessage = error instanceof Error ? error.message : String(error)

			if (errorMessage.includes('BOOKING_NOT_FOUND')) {
				message.error('Không tìm thấy booking')
			} else if (errorMessage.includes('INVALID_STATUS')) {
				message.error('Booking không ở trạng thái hợp lệ để check-in')
			} else {
				message.error(`Check-in thất bại: ${errorMessage}`)
			}
		},
	})
}
