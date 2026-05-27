import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { HousekeepingStatus } from '@/types/database'

const CYCLE: HousekeepingStatus[] = ['dirty', 'cleaning', 'clean']

const STATUS_LABEL: Record<HousekeepingStatus, string> = {
  clean: 'Sạch',
  dirty: 'Cần dọn',
  cleaning: 'Đang dọn',
  out_of_order: 'Hỏng',
}

export function nextStatus(current: HousekeepingStatus): HousekeepingStatus {
  const idx = CYCLE.indexOf(current)

  if (idx === -1) {
    return current
  }

  return CYCLE[(idx + 1) % CYCLE.length]
}

export function useUpdateHousekeeping() {
  const queryClient = useQueryClient()
  const { message, notification } = useAppFeedback()

  return useMutation({
    mutationFn: async ({ roomId, status }: { roomId: string; status: HousekeepingStatus }) => {
      const { error } = await supabase.rpc('update_housekeeping_status', {
        p_room_id: roomId,
        p_status: status,
      })

      if (error) throw error
    },
    onSuccess: (_, { roomId, status }) => {
      void queryClient.invalidateQueries({ queryKey: ['rooms'] })
      void queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
      message.success(`Phòng ${roomId}: ${STATUS_LABEL[status]}`)
    },
    onError: (error: Error) => {
      const normalizedError = normalizeError(error)
      notification.error({
        message: 'Không thể cập nhật housekeeping',
        description: normalizedError.message,
      })
    },
  })
}

export type { HousekeepingStatus }
export { STATUS_LABEL }