// src/features/documents/useDocumentGenerator.ts
// Hook tổng: fetch data → build DocumentData → render → print/copy → log

import { useState, useCallback } from 'react'
import { message } from 'antd'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import {
  renderDocumentHtml,
  renderDocumentZalo,
  type DocKind,
  type DocumentData,
  type BookingLine,
  type PaymentLine,
} from './documentTemplates'

// ─── Thông tin hostel cố định ─────────────────────────────────────────────────
const HOSTEL_INFO = {
  hostel_name: 'Hello Dalat Hostel',
  hostel_phone: '0969 975 935',
  hostel_address: '33/18/2 Phan Đình Phùng, P.1, Đà Lạt',
  hostel_bank: 'Vietcombank',
  hostel_account: '9969975935',
  hostel_account_name: 'Nguyen Thanh Hieu',
} as const

// ─── Types từ Supabase ────────────────────────────────────────────────────────

interface GroupRow {
  id: string
  customer_name: string
  customer_phone: string | null
  customer_note: string | null
  source: string | null
  channel_fee_rate: number
  ota_booking_number: string | null
  paid: number
  created_at: string
  net_revenue: number
  status: string
}

interface RoomRow {
  id: string
  name: string
}

interface BookingGuestRow {
  is_primary: boolean
  guests: {
    full_name: string
    phone?: string | null
    email?: string | null
  }[] | null
}

interface BookingRow {
  id: string
  check_in: string
  check_out: string
  nights: number | null
  price: number
  grand_total: number | null
  status: string
  guest_name: string | null
  guests_count: number
  rooms: RoomRow[] | null
  booking_guests: BookingGuestRow[] | null
}

// ─── Fetch group data ─────────────────────────────────────────────────────────

async function fetchGroupDocumentData(groupId: string): Promise<DocumentData> {
  const [groupRes, bookingsRes] = await Promise.all([
    supabase
      .from('groups')
      .select('id, customer_name, customer_phone, customer_note, source, channel_fee_rate, ota_booking_number, paid, created_at, net_revenue, status')
      .eq('id', groupId)
      .single(),

    supabase
      .from('bookings')
      .select(`
        id, check_in, check_out, nights, price, grand_total, status,
        guest_name, guests_count,
        rooms ( id, name ),
        booking_guests (
          is_primary,
          guests ( full_name, phone, email )
        )
      `)
      .eq('group_id', groupId)
      .eq('is_deleted', false)
      .neq('status', 'cancelled'),
  ])

  if (groupRes.error) throw groupRes.error
  if (bookingsRes.error) throw bookingsRes.error

  const group = groupRes.data as GroupRow
  const bookingRows = (bookingsRes.data ?? []) as BookingRow[]

  const bookingLines: BookingLine[] = bookingRows.map((b) => {
    const room = b.rooms?.[0] ?? null
    const nights = Math.max(1, b.nights ?? 1)
    return {
      id: b.id,
      room_name: room?.name ?? 'N/A',
      room_number: room?.id ?? '',
      check_in: b.check_in,
      check_out: b.check_out,
      nights,
      rate_per_night: b.price ?? 0,
      room_total: b.grand_total ?? 0,
    }
  })

  let guestName = group.customer_name || 'Quý khách'
  let guestPhone: string | undefined
  let guestEmail: string | undefined

  if (group.customer_phone) {
    guestPhone = group.customer_phone
  }

  for (const b of bookingRows) {
    const primary = b.booking_guests?.find((bg) => bg.is_primary)
    const guest = primary?.guests?.[0]
    if (guest) {
      guestName = guest.full_name
      guestPhone = guest.phone ?? undefined
      guestEmail = guest.email ?? undefined
      break
    }
  }
  const grandTotal = bookingRows.reduce((sum, booking) => sum + (booking.grand_total ?? 0), 0)
  const totalPaid = group.paid ?? 0

  return {
    group_id: group.id,
    group_code: group.id.slice(-6).toUpperCase(),
    created_at: group.created_at,
    guest_name: guestName,
    guest_phone: guestPhone,
    guest_email: guestEmail,
    bookings: bookingLines,
    services: [],
    discounts: [],
    grand_total: grandTotal,
    total_paid: totalPaid,
    remaining: Math.max(0, grandTotal - totalPaid),
    payments: [],
    ...HOSTEL_INFO,
  }
}

// ─── RPC: create_document_log ─────────────────────────────────────────────────

interface CreateDocumentLogParams {
  groupId: string
  bookingId?: string
  docKind: DocKind
  docFormat: 'pdf' | 'zalo_text' | 'email_html'
  contentSnapshot: Record<string, unknown>
  recipientName?: string
  recipientPhone?: string
  note?: string
}

async function callCreateDocumentLog(params: CreateDocumentLogParams): Promise<string> {
  const { data, error } = await supabase.rpc('create_document_log', {
    p_group_id: params.groupId,
    p_booking_id: params.bookingId ?? null,
    p_doc_kind: params.docKind,
    p_doc_format: params.docFormat,
    p_content_snapshot: params.contentSnapshot,
    p_recipient_name: params.recipientName ?? null,
    p_recipient_phone: params.recipientPhone ?? null,
    p_note: params.note ?? null,
  })
  if (error) throw error
  return data as string
}

// ─── Print HTML vào cửa sổ in ─────────────────────────────────────────────────

function printHtmlDocument(win: Window, html: string, title: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false

    const finish = (printed: boolean) => {
      if (settled) return
      settled = true
      window.clearInterval(closeWatcher)
      window.clearTimeout(fallbackTimer)
      win.removeEventListener('afterprint', handleAfterPrint)
      resolve(printed)
    }

    const handleAfterPrint = () => {
      finish(true)
    }

    const closeWatcher = window.setInterval(() => {
      if (win.closed) {
        finish(false)
      }
    }, 400)

    const fallbackTimer = window.setTimeout(() => {
      finish(false)
    }, 120_000)

    win.addEventListener('afterprint', handleAfterPrint, { once: true })
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.document.title = title

    setTimeout(() => {
      if (win.closed) {
        finish(false)
        return
      }

      win.focus()
      win.print()
    }, 250)
  })
}

// ─── Hook chính ───────────────────────────────────────────────────────────────

export interface UseDocumentGeneratorOptions {
  groupId: string
  /** Optional: prefetch data ngay khi mount (default: false — fetch khi generate) */
  prefetch?: boolean
}

export interface GenerateHtmlOptions {
  kind: DocKind
  depositAmount?: number     // override tính tự động cho deposit_request
  depositDeadline?: string   // ISO date
}

export interface GenerateZaloOptions {
  kind: DocKind
  depositAmount?: number
  depositDeadline?: string
}

export function useDocumentGenerator({ groupId, prefetch = false }: UseDocumentGeneratorOptions) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [zaloText, setZaloText] = useState<string | null>(null)

  // Query data (enabled=prefetch hoặc enabled sẽ được enable thủ công qua refetch)
  const {
    data: docData,
    isLoading: isLoadingData,
    error: dataError,
    refetch: refetchData,
  } = useQuery({
    queryKey: ['document-data', groupId],
    queryFn: () => fetchGroupDocumentData(groupId),
    enabled: prefetch && !!groupId,
    staleTime: 30_000, // 30s — data không đổi nhiều khi đang generate
  })

  // Mutation: ghi log sau khi print/copy
  const { mutateAsync: logDocument } = useMutation({
    mutationFn: callCreateDocumentLog,
    // Không invalidate queries khác — document_logs là audit trail độc lập
  })

  /**
   * Generate và mở cửa sổ in HTML
   * Sau khi user đóng/print: ghi log tự động
   */
  const generateAndPrint = useCallback(
    async (options: GenerateHtmlOptions): Promise<void> => {
      if (!groupId) return
      setIsGenerating(true)

      const printWindow = window.open('', '_blank', 'width=800,height=900')
      if (!printWindow) {
        setIsGenerating(false)
        message.error('Trình duyệt chặn popup. Vui lòng cho phép popup và thử lại.')
        return
      }

      printWindow.document.write('<p style="font-family: Arial, sans-serif; padding: 24px;">Đang chuẩn bị tài liệu in...</p>')
      printWindow.document.close()
      printWindow.document.title = `${options.kind}_${groupId.slice(-6)}`

      try {
        // Fetch data (dùng cache nếu có)
        let data = docData
        if (!data) {
          const result = await refetchData()
          data = result.data
        }
        if (!data) throw new Error('Không thể tải dữ liệu đặt phòng')

        // Override deposit fields nếu có
        const finalData: DocumentData = {
          ...data,
          deposit_amount: options.depositAmount,
          deposit_deadline: options.depositDeadline,
        }

        const html = renderDocumentHtml(options.kind, finalData)
        const title = `${options.kind}_${data.group_code ?? groupId.slice(-6)}`

        const printed = await printHtmlDocument(printWindow, html, title)

        if (printed) {
          // Ghi log sau khi user đã hoàn tất hộp thoại in
          await logDocument({
            groupId,
            docKind: options.kind,
            docFormat: 'pdf',
            contentSnapshot: {
              kind: options.kind,
              guest_name: data.guest_name,
              grand_total: data.grand_total,
              remaining: data.remaining,
              booking_count: data.bookings.length,
            },
            recipientName: data.guest_name,
            recipientPhone: data.guest_phone,
            note: 'In từ PMS',
          }).catch((err) => {
            // Log fail không block workflow
            console.error('[document_log] Failed to log:', err)
          })
        }
      } catch (err) {
        console.error('[generateAndPrint]', err)
        message.error('Không thể tạo tài liệu. Vui lòng thử lại.')
        if (!printWindow.closed) {
          printWindow.close()
        }
      } finally {
        setIsGenerating(false)
      }
    },
    [groupId, docData, refetchData, logDocument]
  )

  /**
   * Generate Zalo text và copy vào clipboard
   * Sau khi copy: ghi log tự động
   */
  const generateAndCopyZalo = useCallback(
    async (options: GenerateZaloOptions): Promise<void> => {
      if (!groupId) return
      setIsGenerating(true)

      try {
        let data = docData
        if (!data) {
          const result = await refetchData()
          data = result.data
        }
        if (!data) throw new Error('Không thể tải dữ liệu đặt phòng')

        const finalData: DocumentData = {
          ...data,
          deposit_amount: options.depositAmount,
          deposit_deadline: options.depositDeadline,
        }

        const text = renderDocumentZalo(options.kind, finalData)
        setZaloText(text)

        // Copy vào clipboard
        try {
          await navigator.clipboard.writeText(text)
          message.success('Đã copy text Zalo. Paste vào Zalo để gửi!')
        } catch {
          // Fallback: hiển thị text để user copy thủ công
          message.info('Không thể copy tự động. Vui lòng copy thủ công.')
        }

        // Ghi log
        await logDocument({
          groupId,
          docKind: options.kind,
          docFormat: 'zalo_text',
          contentSnapshot: {
            kind: options.kind,
            guest_name: data.guest_name,
            grand_total: data.grand_total,
          },
          recipientName: data.guest_name,
          recipientPhone: data.guest_phone,
          note: 'Gửi qua Zalo',
        }).catch((err) => {
          console.error('[document_log] Failed to log:', err)
        })
      } catch (err) {
        console.error('[generateAndCopyZalo]', err)
        message.error('Không thể tạo text Zalo. Vui lòng thử lại.')
      } finally {
        setIsGenerating(false)
      }
    },
    [groupId, docData, refetchData, logDocument]
  )

  /** Preview Zalo text (không log) */
  const previewZalo = useCallback(
    async (options: GenerateZaloOptions): Promise<string | null> => {
      try {
        let data = docData
        if (!data) {
          const result = await refetchData()
          data = result.data
        }
        if (!data) return null

        const finalData: DocumentData = {
          ...data,
          deposit_amount: options.depositAmount,
          deposit_deadline: options.depositDeadline,
        }

        return renderDocumentZalo(options.kind, finalData)
      } catch {
        return null
      }
    },
    [docData, refetchData]
  )

  return {
    /** Data đã fetch (nếu prefetch=true hoặc sau lần generate đầu) */
    docData,
    isLoadingData,
    dataError,

    /** Đang generate/in/copy */
    isGenerating,

    /** Zalo text vừa generate (để hiển thị preview) */
    zaloText,
    clearZaloText: () => setZaloText(null),

    /** Mở cửa sổ in, sau đó log */
    generateAndPrint,

    /** Copy Zalo text vào clipboard, sau đó log */
    generateAndCopyZalo,

    /** Preview Zalo text mà không log */
    previewZalo,
  }
}
