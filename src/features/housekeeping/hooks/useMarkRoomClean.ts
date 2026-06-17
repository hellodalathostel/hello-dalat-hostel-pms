import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

interface MarkRoomCleanParams {
  roomId: string
}

interface MarkRoomCleanResponse {
  success: boolean
  room_id: string
  status: string
}

// Hook gọi RPC mark_room_clean_txn — dùng cho nút "Đã dọn xong" trên Dashboard.
// Lưu ý: RPC throw lỗi qua RAISE EXCEPTION (không trả success:false trong payload),
// nên phải bắt lỗi ở catch, không đọc data.success khi lỗi.
export function useMarkRoomClean() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationKey: ['mark-room-clean'],
    mutationFn: async ({ roomId }: MarkRoomCleanParams) => {
      try {
        const { data, error } = await supabase.rpc('mark_room_clean_txn', {
          p_room_id: roomId,
        })

        if (error) {
          throw error
        }

        return data as MarkRoomCleanResponse
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rooms'] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
      ])
      message.success('Đã đánh dấu phòng sạch')
    },
    onError: (error: Error) => {
      const msg = error.message

      if (msg.includes('ROOM_OUT_OF_ORDER')) {
        message.error('Phòng đang ở trạng thái hỏng/khóa — không thể đánh dấu dọn xong')
        return
      }

      if (msg.includes('ROOM_NOT_FOUND')) {
        message.error('Không tìm thấy phòng')
        return
      }

      message.error(`Lỗi: ${msg}`)
    },
  })
}
