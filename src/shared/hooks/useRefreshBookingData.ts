// Helper dùng chung: tải lại MỌI dữ liệu liên quan booking sau một mutation thành công.
//
// Lý do (QA 15/10/2026, B-02/B-03): trước đây mỗi hook tự invalidate một bộ key riêng và
// bị lệch — danh sách đặt phòng dùng key ['bookings-list'] nhưng không mutation nào
// invalidate key này; useAddService invalidate ['booking-detail', bookingId] (sai — key là
// groupId); useAddRoomToGroup invalidate ['group', …] (key không tồn tại). Kết quả: bảng,
// drawer, folio giữ số cũ đến khi F5.
//
// Dùng prefix key (không truyền id) để bắt mọi biến thể: ['booking-detail', groupId] của
// drawer và ['booking-detail', bookingId] của dashboard, mọi ['booking-folio', id]…
// Query không còn mount chỉ bị đánh dấu stale; query đang mở sẽ refetch ngay.
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

export const BOOKING_RELATED_QUERY_KEYS: readonly QueryKey[] = [
  ['bookings-list'],
  ['bookings'],
  ['booking-detail'],
  ['booking-folio'],
  ['groups'],
  ['room-calendar'],
  ['dashboard'],
  ['dashboard-summary'],
  ['finance'],
]

export const REFRESH_FAILED_MESSAGE = 'Đã lưu nhưng chưa tải lại được, hãy tải lại trang'

export function useRefreshBookingData() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useCallback(async (): Promise<void> => {
    // throwOnError: mặc định refetch nuốt lỗi — bật lên để biết refetch có thất bại không
    const results = await Promise.allSettled(
      BOOKING_RELATED_QUERY_KEYS.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }, { throwOnError: true }),
      ),
    )

    if (results.some((result) => result.status === 'rejected')) {
      message.warning(REFRESH_FAILED_MESSAGE)
    }
  }, [queryClient, message])
}
