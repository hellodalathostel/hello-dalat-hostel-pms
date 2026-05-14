// src/features/documents/useDocumentGenerator.ts
// Hook tổng: fetch data → build DocumentData → render → print/copy → log

import { useState, useCallback } from 'react'
import { message } from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import {
  renderDocumentHtml,
  renderDocumentZalo,
  type DocKind,
  type DocumentData,
  type BookingLine,
  type ServiceLine,
  type DiscountLine,
  type PaymentLine,
} from './documentTemplates'

// ─── Thông tin hostel cố định ─────────────────────────────────────────────────
const HOSTEL_INFO = {
  hostel_name: 'Hello Dalat Hostel',
  hostel_phone: '0969 975 935',
  hostel_address: '33/18/2 Phan Đình Phùng, P.1, Đà Lạt',
  hostel_bank: 'Vietcombank',           // TODO: cập nhật đúng nếu khác
  hostel_account: '9969975935',                    // TODO: điền số tài khoản thực
  hostel_account_name: 'Nguyen Thanh Hieu,
} as const

// ─── Types từ Supabase ────────────────────────────────────────────────────────

interface GroupRow {
  id: string
  created_at: string
  grand_total: number
  net_revenue: number
}

interface BookingRow {
  id: string
  room_id: string
  check_in: string
  check_out: string
  rate_per_night: number
  room_total: number
  status: string
  rooms: { name: string; room_number: string } | null
  booking_guests: {
    is_primary: boolean
    guests: {
      full_name: string
      phone?: string
      email?: string
    } | null
  }[]
}

interface PaymentRow {
  id: string
  date: string  // DATE type từ payment_history
  method: string
  amount: number
  note: string | null
}

interface BookingServiceRow {
  id: string
  name: string
  qty: number
  price: number
}

interface BookingDiscountRow {
  description: string
  amount: number
}

// ─── Fetch group data ─────────────────────────────────────────────────────────

async function fetchGroupDocumentData(groupId: string): Promise<DocumentData> {
  // Query song song: group + bookings + payments
  const [groupRes, bookingsRes, paymentsRes] = await Promise.all([
    supabase
      .from('booking_groups')
      .select('id, created_at, grand_total, net_revenue')
      .eq('id', groupId)
      .single(),

    supabase
      .from('bookings')
      .select(`
        id, room_id, check_in, check_out, rate_per_night, room_total, status,
        rooms ( name, room_number ),
        booking_guests (
          is_primary,
          guests ( full_name, phone, email )
        )
      `)
      .eq('group_id', groupId)
      .neq('status', 'cancelled'),

    supabase
      .from('payment_history')
      .select('id, date, method, amount, note')
      .eq('group_id', groupId)
      .order('date', { ascending: true }),
  ])

  if (groupRes.error) throw groupRes.error
  if (bookingsRes.error) throw bookingsRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const group = groupRes.data as GroupRow
  const bookingRows = (bookingsRes.data ?? []) as BookingRow[]
  const paymentRows = (paymentsRes.data ?? []) as PaymentRow[]

  // Gom services + discounts từ tất cả bookings (query song song)
  const bookingIds = bookingRows.map((b) => b.id)
  const [servicesRes, discountsRes] = await Promise.all([
    bookingIds.length > 0
      ? supabase
          .from('booking_services')
          .select('id, name, qty, price')
          .in('booking_id', bookingIds)
      : Promise.resolve({ data: [], error: null }),

    bookingIds.length > 0
      ? supabase
          .from('booking_discounts')
          .select('description, amount')
          .in('booking_id', bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (servicesRes.error) throw servicesRes.error
  if (discountsRes.error) throw discountsRes.error

  // Build BookingLines
  const bookingLines: BookingLine[] = bookingRows.map((b) => {
    const nights = Math.max(
      1,
      Math.round(
        (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    )
    return {
      id: b.id,
      room_name: b.rooms?.name ?? 'N/A',
      room_number: b.rooms?.room_number ?? '',
      check_in: b.check_in,
      check_out: b.check_out,
      nights,
      rate_per_night: b.rate_per_night,
      room_total: b.room_total,
    }
  })

  // Tìm khách chính (is_primary = true từ booking đầu tiên)
  let guestName = 'Quý khách'
  let guestPhone: string | undefined
  let guestEmail: string | undefined

  for (const b of bookingRows) {
    const primary = b.booking_guests?.find((bg) => bg.is_primary)
    if (primary?.guests) {
      guestName = primary.guests.full_name
      guestPhone = primary.guests.phone ?? undefined
      guestEmail = primary.guests.email ?? undefined
      break
    }
  }

  // ServiceLines — gom theo tên (cộng dồn nếu trùng)
  const serviceMap = new Map<string, ServiceLine>()
  for (const s of (servicesRes.data ?? []) as BookingServiceRow[]) {
    const existing = serviceMap.get(s.name)
    if (existing) {
      existing.quantity += s.qty
      existing.total += s.qty * s.price
    } else {
      serviceMap.set(s.name, {
        name: s.name,
        quantity: s.qty,
        unit_price: s.price,
        total: s.qty * s.price,
      })
    }
  }

  // DiscountLines
  const discountLines: DiscountLine[] = (discountsRes.data ?? []).map(
    (d: BookingDiscountRow) => ({
      description: d.description,
      amount: d.amount,
    })
  )

  // PaymentLines
  const paymentLines: PaymentLine[] = paymentRows.map((p) => ({
    paid_at: p.date,  // DATE → ISO string
    method: p.method,
    amount: p.amount,
    note: p.note ?? undefined,
  }))

  const totalPaid = paymentRows.reduce((sum, p) => sum + p.amount, 0)

  return {
    group_id: group.id,
    group_code: group.id.slice(-6).toUpperCase(),
    created_at: group.created_at,
    guest_name: guestName,
    guest_phone: guestPhone,
    guest_email: guestEmail,
    bookings: bookingLines,
    services: Array.from(serviceMap.values()),
    discounts: discountLines,
    grand_total: group.grand_total,
    total_paid: totalPaid,
    remaining: Math.max(0, group.grand_total - totalPaid),
    payments: paymentLines,
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

function printHtmlDocument(html: string, title: string): void {
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) {
    message.error('Trình duyệt chặn popup. Vui lòng cho phép popup và thử lại.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.document.title = title
  // Delay nhỏ để render xong trước khi print
  setTimeout(() => {
    win.focus()
    win.print()
  }, 500)
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

        printHtmlDocument(html, title)

        // Ghi log — không block UI
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
          note: `In từ PMS`,
        }).catch((err) => {
          // Log fail không block workflow
          console.error('[document_log] Failed to log:', err)
        })
      } catch (err) {
        console.error('[generateAndPrint]', err)
        message.error('Không thể tạo tài liệu. Vui lòng thử lại.')
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
