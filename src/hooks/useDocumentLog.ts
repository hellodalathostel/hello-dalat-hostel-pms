import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'

// Kiểu dữ liệu cho params của RPC create_document_log
interface CreateDocumentLogParams {
  p_group_id: string
  p_booking_id?: string
  p_doc_type: 'booking_confirmation' | 'deposit_request' | 'deposit_confirmation' | 'invoice' | 'arrival_notice'
  p_doc_format: 'pdf' | 'zalo_text' | 'email_html'
  p_content_snapshot?: Record<string, unknown>
  p_sent_via?: string
  p_recipient_name?: string
  p_recipient_phone?: string
  p_note?: string
}

// Hook fire-and-forget — không block UI, không throw lên trên
export function useDocumentLog() {
  const { mutate } = useMutation({
    mutationFn: async (params: CreateDocumentLogParams) => {
      const { error } = await supabase.rpc('create_document_log', params)
      if (error) throw error
    },
    onError: (err) => {
      // Silent fail — chỉ log console, không toast vì đây là audit trail
      console.error('[DocumentLog] Ghi log thất bại:', err)
    },
  })

  // Trả về hàm logDocument để gọi sau khi print/copy xong
  const logDocument = (params: CreateDocumentLogParams) => {
    mutate(params)
  }

  return { logDocument }
}