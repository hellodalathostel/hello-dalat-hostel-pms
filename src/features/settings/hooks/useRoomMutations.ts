// Hook tạo/sửa/ẩn phòng — chỉ Owner dùng được (RLS owner_write chặn ở DB,
// UI cũng ẩn nút cho Staff để tránh nhận lỗi RLS confusing).
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

function generateIcalToken(): string {
  // hex32 — giữ đúng pattern token cũ trong DB (ví dụ "53a8a98b3a6802c3469abbdc6ae62dc2")
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function useCreateRoom() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (input: CreateRoomInput) => {
      const { error } = await supabase.from('rooms').insert({
        ...input,
        ical_export_token: generateIcalToken(),
        is_active: true,
        housekeeping_status: 'clean',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      message.success('Đã thêm phòng mới')
    },
    onError: (error) => {
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
      const { error } = await supabase.from('rooms').update(rest).eq('id', id)
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
      const { error } = await supabase.from('rooms').update({ is_active }).eq('id', id)
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
