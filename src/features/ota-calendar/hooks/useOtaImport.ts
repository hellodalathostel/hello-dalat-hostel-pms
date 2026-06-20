// src/features/ota-calendar/hooks/useOtaImport.ts
// Hook trigger manual sync "Sync Now" từ UI OTA Calendar tab

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { supabase } from '@/api/supabase'

interface SyncResult {
  room_id: string
  room_name: string
  upserted: number
  conflicts: number
  skipped: boolean
  error: string | null
}

interface SyncResponse {
  totalUpserted: number
  totalConflicts: number
  totalSkipped: number
  errors: number
  results: SyncResult[]
}

export function useOtaImport() {
  const qc = useQueryClient()

  return useMutation<SyncResponse, Error>({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Chưa đăng nhập')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ical-import`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Gửi user JWT — Edge Function dùng service_role nội bộ
            // nhưng cần auth header để Supabase gateway không block
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      )

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Sync thất bại: ${text}`)
      }

      return res.json() as Promise<SyncResponse>
    },

    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['ota-events'] })
      // M1 fix: 'ota-rooms' đã merge vào canonical 'rooms' query key (useRooms hook)
      qc.invalidateQueries({ queryKey: ['rooms'] })
      if (data.totalConflicts > 0) {
        message.warning(
          `Sync xong — ${data.totalUpserted} events, ⚠️ ${data.totalConflicts} conflict cần xử lý`
        )
      } else {
        message.success(
          `Sync xong — ${data.totalUpserted} events, ${data.totalSkipped} phòng không đổi`
        )
      }
    },

    onError: (err) => {
      message.error(`Lỗi sync OTA: ${err.message}`)
    },
  })
}
