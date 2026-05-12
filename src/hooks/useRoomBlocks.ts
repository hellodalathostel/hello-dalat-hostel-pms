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

// Tạo block phòng mới qua RPC transaction.
export function useCreateBlock() {
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['create-room-block'],
    mutationFn: async (payload: CreateBlockPayload) => {
      try {
        const { data, error } = await supabase.rpc('create_room_block_txn', {
          p_room_id: payload.roomId,
          p_start_date: payload.startDate.format('YYYY-MM-DD'),
          p_end_date: payload.endDate.format('YYYY-MM-DD'),
          p_reason: payload.reason,
          p_note: payload.note ?? '',
        })

        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Tạo block thất bại')
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

// Gỡ block phòng qua RPC transaction.
export function useDeleteBlock() {
  const queryClient = useQueryClient()
  const { message, notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['delete-room-block'],
    mutationFn: async (blockId: string) => {
      try {
        const { data, error } = await supabase.rpc('delete_room_block_txn', {
          p_block_id: blockId,
        })

        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Xóa block thất bại')
        }

        return data
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