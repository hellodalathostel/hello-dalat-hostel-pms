import type { Dayjs } from 'dayjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

export type BlockReason = 'maintenance' | 'owner_use' | 'ota_closed' | 'deep_cleaning' | 'other'

export const BLOCK_REASON_LABELS: Record<BlockReason, string> = {
  maintenance: 'Sua chua / Bao tri',
  owner_use: 'Chu nha sd',
  ota_closed: 'Dong phong OTA',
  deep_cleaning: 'Ve sinh sau',
  other: 'Khac',
}

export interface CreateBlockPayload {
  roomId: string
  startDate: Dayjs
  endDate: Dayjs
  reason: BlockReason
  note?: string
}

async function invalidateOperationalQueries(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
}

// Tạo block phòng mới trực tiếp (không qua RPC)
export function useCreateBlock() {
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['create-room-block'],
    mutationFn: async (payload: CreateBlockPayload) => {
      try {
        const { data, error } = await supabase
          .from('room_blocks')
          .insert([
            {
              room_id: payload.roomId,
              start_date: payload.startDate.format('YYYY-MM-DD'),
              end_date: payload.endDate.format('YYYY-MM-DD'),
              reason: payload.reason,
              note: payload.note ?? '',
            },
          ])
          .select()

        if (error) {
          throw error
        }

        return data
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async () => {
      await invalidateOperationalQueries(queryClient)
    },
    onError: (error) => {
      const normalizedError = normalizeError(error)
      notification.error({
        message: 'Không thể block phòng',
        description: normalizedError.message,
      })
    },
  })
}

// Gỡ block phòng trực tiếp (không qua RPC)
export function useDeleteBlock() {
  const queryClient = useQueryClient()
  const { message, notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['delete-room-block'],
    mutationFn: async (blockId: string) => {
      try {
        const { error } = await supabase
          .from('room_blocks')
          .delete()
          .eq('id', blockId)

        if (error) {
          throw error
        }

        return { success: true }
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: () => {
      message.success('Mở block thành công')
      queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
    },
    onError: (error) => {
      const normalizedError = normalizeError(error)
      notification.error({
        message: 'Không thể mở block',
        description: normalizedError.message,
      })
    },
  })
}

export function useBlocksForRoom(roomId: string | null) {
  return useQuery({
    queryKey: ['room-blocks', roomId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('room_blocks')
          .select('*')
          .eq('room_id', roomId!)
          .order('start_date')

        if (error) {
          throw error
        }

        return data
      } catch (error) {
        throw normalizeError(error)
      }
    },
    enabled: !!roomId,
    staleTime: 30 * 1000,
  })
}