// Hook tạo/sửa/ẩn phòng — Owner + Staff đều dùng được (nguyên tắc #3: full CRUD
// hầu hết bảng nghiệp vụ, không phân quyền chi tiết). Quyết định 2026-07-02:
// đã bỏ RLS owner_write, gọi qua RPC _txn để có validate tập trung ở DB.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface CreateRoomInput {
  id: string
  name: string
  type: string
  capacity: number
  base_price: number
  floor: number | null
}

export interface UpdateRoomInput {
  id: string
  name?: string
  type?: string
  capacity?: number
  base_price?: number
  floor?: number | null
}

// generateIcalToken đã chuyển vào DB (create_room_txn dùng pgcrypto.gen_random_bytes)

export function useCreateRoom() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (input: CreateRoomInput) => {
      const { error } = await supabase.rpc('create_room_txn', {
        p_id: input.id,
        p_name: input.name,
        p_type: input.type,
        p_capacity: input.capacity,
        p_base_price: input.base_price,
        p_floor: input.floor,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      message.success('Đã thêm phòng mới')
    },
    onError: (error) => {
      // ROOM_ID_EXISTS từ RPC — thông báo rõ hơn lỗi constraint DB thô
      if (error instanceof Error && error.message.includes('ROOM_ID_EXISTS')) {
        message.error('Mã phòng này đã tồn tại, chọn mã khác')
        return
      }
      console.error(error)
      message.error(normalizeError(error).message)
    },
  })
}

export function useUpdateRoom() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async ({ id, ...rest }: UpdateRoomInput) => {
      const { error } = await supabase.rpc('update_room_txn', {
        p_id: id,
        p_name: rest.name,
        p_type: rest.type,
        p_capacity: rest.capacity,
        // p_floor_set=true khi field floor có mặt trong rest (kể cả khi giá trị là null
        // — nghĩa là user chủ động xóa floor), false khi field floor không được truyền vào
        p_floor: rest.floor,
        p_floor_set: 'floor' in rest,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      message.success('Đã lưu thay đổi')
    },
    onError: (error) => {
      console.error(error)
      message.error(normalizeError(error).message)
    },
  })
}

export function useToggleRoomActive() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.rpc('toggle_room_active_txn', {
        p_id: id,
        p_is_active: is_active,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      message.success(variables.is_active ? 'Đã kích hoạt lại phòng' : 'Đã ẩn phòng')
    },
    onError: (error) => {
      console.error(error)
      message.error(normalizeError(error).message)
    },
  })
}
