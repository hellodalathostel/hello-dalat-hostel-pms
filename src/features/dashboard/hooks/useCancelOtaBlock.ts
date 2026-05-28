// Hook hủy OTA block — đánh dấu is_cancelled trên ota_calendar_feed
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

export function useCancelOtaBlock() {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async (blockId: string) => {
      const { data, error } = await supabase.rpc('cancel_ota_block', {
        p_block_id: blockId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      message.success('Đã đánh dấu hủy OTA block')
      queryClient.invalidateQueries({ queryKey: ['ota-blocks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['room-calendar'] })
    },
    onError: (error: Error) => {
      message.error(`Hủy block thất bại: ${error.message}`)
    },
  })
}
