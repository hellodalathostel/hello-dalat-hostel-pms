import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'

export interface DocumentLogEntry {
  id: string
  group_id: string
  booking_id: string | null
  doc_type: 'booking_confirmation' | 'deposit_request' | 'deposit_confirmation' | 'invoice' | 'arrival_notice'
  doc_format: 'pdf' | 'zalo_text' | 'email_html'
  sent_via: string | null
  recipient_name: string | null
  recipient_phone: string | null
  note: string | null
  created_at: string
}

const DOC_TYPE_LABEL: Record<string, string> = {
  booking_confirmation: 'Xác nhận đặt phòng',
  deposit_request: 'Yêu cầu cọc',
  deposit_confirmation: 'Xác nhận cọc',
  invoice: 'Hóa đơn',
  arrival_notice: 'Thông báo đến',
}

const DOC_FORMAT_LABEL: Record<string, string> = {
  pdf: 'PDF',
  zalo_text: 'Zalo',
  email_html: 'Email',
}

export { DOC_TYPE_LABEL, DOC_FORMAT_LABEL }

export function useDocumentHistory(groupId: string | null) {
  return useQuery({
    queryKey: ['document_logs', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_logs')
        .select('*')
        .eq('group_id', groupId!)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as DocumentLogEntry[]
    },
  })
}