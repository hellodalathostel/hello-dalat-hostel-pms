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

// Mã lỗi Postgres custom từ RPC create_room_block_txn / delete_room_block_txn
// (xem migration 20260619000001_create_room_block_txn_rpcs.sql)
const ERROR_CODE_ROOM_HAS_ACTIVE_BOOKING = 'P0041'
const ERROR_CODE_INVALID_DATE_RANGE = 'P0040'
const ERROR_CODE_BLOCK_NOT_FOUND = 'P0042'

interface RoomBlockConflictDetail {
  booking_id: string
  guest_name: string
  check_in: string
  check_out: string
  status: string
}

// Diễn giải lỗi từ RPC thành message tiếng Việt dễ hiểu cho Hiếu/Lợi.
// Supabase trả lỗi Postgres qua field `code` (Postgrest error), DETAIL nằm ở `details`.
function describeBlockError(error: unknown): string {
  const err = error as { code?: string; message?: string; details?: string }

  if (err?.code === ERROR_CODE_ROOM_HAS_ACTIVE_BOOKING) {
    try {
      const detail: RoomBlockConflictDetail = JSON.parse(err.details ?? '{}')
      return `Phong dang co booking cua "${detail.guest_name}" (${detail.check_in} → ${detail.check_out}). Khong the tao block trung ngay nay.`
    } catch {
      return 'Phong dang co booking active trong khoang ngay nay. Khong the tao block.'
    }
  }

  if (err?.code === ERROR_CODE_INVALID_DATE_RANGE) {
    return 'Ngay ket thuc phai sau ngay bat dau.'
  }

  if (err?.code === ERROR_CODE_BLOCK_NOT_FOUND) {
    return 'Block khong ton tai hoac da bi xoa truoc do.'
  }

  return err?.message ?? 'Co loi xay ra, vui long thu lai.'
}

async function invalidateOperationalQueries(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
}

// Tạo block phòng mới — gọi qua RPC create_room_block_txn (chặn cứng nếu trùng booking active).
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
          p_note: payload.note ?? null,
        })

        if (error) {
          throw error
        }

        return data
      } catch (error) {
        throw normalizeError(error, describeBlockError(error))
      }
    },
    onSuccess: async () => {
      await invalidateOperationalQueries(queryClient)
    },
    onError: (error) => {
      const normalizedError = normalizeError(error)
      notification.error({
        message: 'Khong the block phong',
        description: normalizedError.message,
      })
    },
  })
}

// Gỡ block phòng — gọi qua RPC delete_room_block_txn (mọi mutation phải qua RPC,
// direct DELETE đã bị REVOKE khỏi anon/authenticated).
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

        if (error) {
          throw error
        }

        return data
      } catch (error) {
        throw normalizeError(error, describeBlockError(error))
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

// Đọc danh sách block của 1 phòng — vẫn dùng SELECT trực tiếp (an toàn, không nhạy cảm,
// RLS auth_read cho phép authenticated đọc toàn bộ room_blocks).
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