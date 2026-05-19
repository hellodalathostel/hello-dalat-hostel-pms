import { useMutation, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { supabase } from '@/api/supabase'

export interface CheckinGuestPayload {
	full_name: string
	document_type: 'cccd' | 'passport' | 'other'
	document_number: string
	nationality: string
	date_of_birth?: string
	gender?: string
	residency_type?: string
	province?: string
	district?: string
	ward?: string
	address_detail?: string
}

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

	return useMutation({
		mutationFn: async ({ booking_id, guests }: CheckinPayload) => {
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
