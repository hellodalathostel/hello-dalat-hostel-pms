// src/features/bookings/hooks/useSendDeposit.ts
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

interface SendDepositParams {
  groupId: string
  depositAmount?: number // undefined = auto (1 đêm đầu, tính ở backend)
  auto?: boolean
}

export function useSendDeposit() {
  const { message } = useAppFeedback()

  return useMutation({
    mutationFn: async ({ groupId, depositAmount, auto }: SendDepositParams) => {
      const { data, error } = await supabase.functions.invoke('deposit-sender', {
        body: { group_id: groupId, deposit_amount: depositAmount, auto: auto ?? false },
      })
      if (error) throw error
      if (!data?.ok && !data?.skipped) throw new Error(data?.error ?? 'Gửi cọc thất bại')
      return data
    },
    onSuccess: (data) => {
      if (data?.skipped) return // auto bị skip — im lặng, không toast
      message.success(`Đã gửi QR cọc ${data.ref_code} vào Telegram`)
    },
    onError: (error) => {
      message.error(normalizeError(error).message)
    },
  })
}
