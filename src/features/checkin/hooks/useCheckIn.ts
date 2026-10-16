import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { useRefreshBookingData } from '@/shared/hooks/useRefreshBookingData'
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

// Quá thời gian này thì huỷ request — nút không bao giờ quay mãi (B-04)
const CHECKIN_TIMEOUT_MS = 20_000

// Dịch lỗi RPC/mạng sang tiếng Việt. KHÔNG đưa số giấy tờ/tên khách vào thông báo.
function translateCheckinError(errorMessage: string): string {
	if (errorMessage.includes('CHECKIN_TIMEOUT')) {
		return 'Check-in quá 20 giây không phản hồi. Kiểm tra mạng rồi thử lại — nếu lặp lại, tải lại trang.'
	}
	if (errorMessage.includes('BOOKING_NOT_FOUND')) return 'Không tìm thấy booking'
	if (errorMessage.includes('INVALID_STATUS')) return 'Booking không ở trạng thái hợp lệ để check-in'
	if (errorMessage.includes('customers_gender_check')) return 'Giới tính không hợp lệ — chọn Nam/Nữ hoặc để trống'
	if (errorMessage.includes('document_type')) return 'Loại giấy tờ không hợp lệ (CCCD / Hộ chiếu / Giấy tờ khác)'
	if (errorMessage.includes('residency_type')) return 'Loại cư trú không hợp lệ (Thường trú / Tạm trú / Địa chỉ khác)'
	if (errorMessage.includes('date/time') || errorMessage.includes('invalid input syntax for type date')) {
		return 'Ngày sinh không hợp lệ'
	}
	if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
		return 'Mất kết nối mạng — chưa check-in được, hãy thử lại'
	}
	return `Check-in thất bại: ${errorMessage}`
}

// Hook check-in gọi RPC transaction và tự refresh cache liên quan.
export function useCheckIn() {
	const { message } = useAppFeedback()
	const refreshBookingData = useRefreshBookingData()

	return useMutation({
		mutationFn: async ({ booking_id, guests }: CheckinPayload) => {
			if (import.meta.env.DEV) {
				// Chỉ log metadata, KHÔNG log nội dung guests (chứa PII: document_number, full_name, ngày sinh)
				console.log('checkin payload:', { booking_id, guests_count: guests.length })
			}

			// Timeout: AbortSignal huỷ fetch sau 20s → supabase trả error thay vì treo vô hạn
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), CHECKIN_TIMEOUT_MS)

			try {
				const { data, error } = await supabase
					.rpc('checkin_booking_txn', {
						p_booking_id: booking_id,
						p_guests: guests,
					})
					.abortSignal(controller.signal)

				if (controller.signal.aborted) {
					throw new Error('CHECKIN_TIMEOUT')
				}
				if (error) {
					throw new Error(error.message)
				}

				return data as CheckinRpcResponse
			} catch (error) {
				if (controller.signal.aborted) {
					throw new Error('CHECKIN_TIMEOUT', { cause: error })
				}
				throw error instanceof Error ? error : new Error(String(error), { cause: error })
			} finally {
				clearTimeout(timer)
			}
		},
		onSuccess: async () => {
			message.success('Check-in thành công')
			// Tải lại dashboard + drawer + danh sách (không chặn đóng modal)
			void refreshBookingData()
		},
		onError: (error) => {
			const errorMessage = error instanceof Error ? error.message : String(error)
			message.error(translateCheckinError(errorMessage))
		},
	})
}
