// src/features/documents/useDocumentGenerator.ts
// Hook chính điều phối toàn bộ flow tạo document:
//   1. Query data từ Supabase (bookings + groups + rooms + services + discounts + payments)
//   2. Build DocumentData object
//   3. Gọi template function tương ứng
//   4. Trigger print (PDF) hoặc copy text (Zalo)
//   5. Log vào document_logs qua RPC create_document_log

import { useState } from 'react';
import { message } from 'antd';
import dayjs from 'dayjs';
import { supabase } from '@/api/supabase';
import type { DocumentData, DepositRequestOptions } from './documentTemplates';
import type { GroupBookingRow, GroupDocumentData } from './documentTemplates';
import { DOC_KIND_LABELS } from './documentTemplates';
import {
  renderBookingConfirmation,
  renderDepositRequest,
  renderDepositConfirmation,
  renderInvoice,
  renderArrivalNotice,
} from './documentTemplates';
import { openDocumentPreview } from './DocumentPreviewWindow';


export type DocKind =
  | 'booking_confirmation'
  | 'deposit_request'
  | 'deposit_confirmation'
  | 'invoice'
  | 'arrival_notice'
  | 'group_invoice';

export type DocFormat = 'pdf' | 'zalo_text';

export interface GenerateOptions {
  bookingId: string;
  groupId: string;
  docKind: DocKind;
  docFormat: DocFormat;
  /** Ngôn ngữ document: 'vi' (mặc định) | 'en' */
  lang?: 'vi' | 'en';
  /** Chỉ cần khi docKind === 'deposit_request' */
  depositOptions?: DepositRequestOptions;
}

interface DocPayment {
  id: string;
  amount: number;
  method: string | null;
  date: string;
  note: string | null;
}

interface DocumentPreviewData extends DocumentData {
  group: {
    guest_name: string | null;
  };
  bookings: Array<any>;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  card: 'Thẻ',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  other: 'Khác',
};

// ─── Query helpers ─────────────────────────────────────────────────────────────

/** Query toàn bộ data cần thiết cho 1 booking */
async function fetchDocumentData(
  bookingId: string,
  groupId: string
): Promise<DocumentPreviewData> {
  // Booking + room (JOIN thủ công vì không có foreign key tới rooms table)
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select(`
      id, group_id, room_id, check_in, check_out, nights,
      price_per_night, room_subtotal, surcharge, grand_total, tax_rate, tax_amount,
      has_early_check_in, has_late_check_out,
      guest_name, guests_count, status, note
    `)
    .eq('id', bookingId)
    .single();

  if (bErr || !booking) throw new Error('Không tìm thấy booking: ' + bErr?.message);

  // Group (khách + tài chính tổng)
  const { data: group, error: gErr } = await supabase
    .from('groups')
    .select('id, customer_name, customer_phone, source, ota_booking_number, paid, deposit_method')
    .eq('id', groupId)
    .single();

  if (gErr || !group) throw new Error('Không tìm thấy group: ' + gErr?.message);

  // Room info
  const { data: room, error: rErr } = await supabase
    .from('rooms')
    .select('id, name, type')
    .eq('id', booking.room_id)
    .single();

  if (rErr || !room) throw new Error('Không tìm thấy phòng: ' + rErr?.message);

  const [servicesRes, discountsRes, paymentsRes] = await Promise.all([
    supabase
      .from('booking_services')
      .select('name, price, qty')
      .eq('booking_id', bookingId),
    supabase
      .from('booking_discounts')
      .select('description, amount')
      .eq('booking_id', bookingId),
    supabase
      .from('payment_history')
      .select('id, amount, method, date, note')
      .eq('group_id', groupId)
      .order('date', { ascending: true }),
  ]);

  if (servicesRes.error) throw servicesRes.error;
  if (discountsRes.error) throw discountsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const services = servicesRes.data ?? [];
  const discounts = discountsRes.data ?? [];
  const payments = (paymentsRes.data ?? []) as DocPayment[];

  return {
    bookingId: booking.id,
    groupId: group.id,
    roomName: room.name,
    roomType: room.type,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    nights: booking.nights,
    guestsCount: booking.guests_count,
    hasEarlyCheckIn: booking.has_early_check_in ?? false,
    hasLateCheckOut: booking.has_late_check_out ?? false,
    guestName: group.customer_name ?? booking.guest_name,
    guestPhone: group.customer_phone ?? '',
    source: group.source,
    otaBookingNumber: group.ota_booking_number ?? undefined,
    pricePerNight: booking.price_per_night,
    roomSubtotal: booking.room_subtotal ?? 0,
    surcharge: booking.surcharge ?? 0,
    grandTotal: booking.grand_total,
    services: (services ?? []).map(s => ({
      name: s.name,
      price: s.price,
      qty: Number(s.qty),
    })),
    discounts: discounts.map(d => ({
      description: d.description,
      amount: d.amount,
    })),
    paid: group.paid ?? 0,
    payments: payments.map(p => {
      const methodKey = (p.method ?? 'other').toLowerCase();
      const normalizedMethod = PAYMENT_METHOD_LABEL[methodKey] ? methodKey : 'other';
      return {
        id: p.id,
        amount: p.amount,
        method: normalizedMethod,
        date: p.date,
        note: p.note,
      };
    }),
    generatedAt: new Date().toISOString(),
    group: {
      guest_name: group.customer_name ?? booking.guest_name ?? null,
    },
    bookings: [
      {
        room_id: booking.room_id,
      },
    ],
  };
}

function buildPreviewTitle(kind: DocKind, docData: DocumentPreviewData): string {
  const previewTitle = `${DOC_KIND_LABELS[kind]} — ${docData.group.guest_name ?? 'Khach'} | ${
    docData.bookings.map(b => `P.${b.room_id}`).join(', ')
  }`;
  return previewTitle;
}

// ─── Copy Zalo text vào clipboard ──────────────────────────────────────────────

async function copyZaloText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// ─── Ghi log vào document_logs ─────────────────────────────────────────────────

async function logDocument(
  opts: GenerateOptions,
  docData: DocumentData,
  sentVia: string
): Promise<void> {
  // Map docFormat → format enum DB dùng
  const dbFormat = opts.docFormat === 'pdf' ? 'pdf' : 'zalo_text';

  // content_snapshot: lưu data tại thời điểm generate (bất biến kể cả sau khi booking sửa)
  const snapshot = JSON.parse(JSON.stringify({
    guestName: docData.guestName,
    roomName: docData.roomName,
    checkIn: docData.checkIn,
    checkOut: docData.checkOut,
    nights: docData.nights,
    grandTotal: docData.grandTotal,
    paid: docData.paid,
    generatedAt: docData.generatedAt,
  }));

  const { error } = await supabase.rpc('create_document_log', {
    p_group_id: opts.groupId,
    p_booking_id: opts.bookingId,
    p_doc_type: opts.docKind,
    p_doc_format: dbFormat,
    p_content_snapshot: snapshot,
    p_sent_via: sentVia,
    p_recipient_name: docData.guestName,
    p_recipient_phone: docData.guestPhone || null,
    p_note: null,
  });

  // Log lỗi nhưng không throw — document đã được generate rồi
  if (error) {
    console.error('[useDocumentGenerator] Lỗi ghi log:', error.message);
  }
}

// ─── fetchGroupDocumentData ──────────────────────────────────────────────────
// Query tất cả bookings của group để render group_invoice
// grandTotal = SUM(booking.grand_total) — đọc từ DB, không tính frontend
export async function fetchGroupDocumentData(
  groupId: string
): Promise<GroupDocumentData> {
  // 1. Lấy thông tin group
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, customer_name, customer_phone, source, ota_booking_number, paid')
    .eq('id', groupId)
    .single();

  if (groupError || !group) {
    throw new Error(`Không tìm thấy group: ${groupError?.message ?? 'unknown'}`);
  }

  // 2. Lấy tất cả bookings thuộc group (chỉ active — không lấy cancelled)
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id,
      room_id,
      check_in,
      check_out,
      nights,
      price_per_night,
      room_subtotal,
      surcharge,
      grand_total,
      status,
      booking_services (
        name,
        price,
        qty
      ),
      booking_discounts (
        description,
        amount
      ),
      rooms (
        id,
        name,
        type
      )
    `)
    .eq('group_id', groupId)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .neq('status', 'cancelled')
    .order('check_in', { ascending: true });

  if (bookingsError) {
    throw new Error(`Lỗi query bookings: ${bookingsError.message}`);
  }

  if (!bookings || bookings.length === 0) {
    throw new Error('Group không có booking nào hợp lệ.');
  }

  // 3. Map sang GroupBookingRow[]
  const rows: GroupBookingRow[] = bookings.map((b) => {
    const room = (b.rooms as { id: string; name: string; type: string } | null);
    return {
      bookingId: b.id,
      roomName: room?.name ?? b.room_id,
      roomType: room?.type ?? '',
      checkIn: b.check_in,
      checkOut: b.check_out,
      nights: b.nights ?? 0,
      pricePerNight: b.price_per_night ?? 0,
      roomSubtotal: b.room_subtotal ?? 0,
      surcharge: b.surcharge ?? 0,
      services: (b.booking_services ?? []).map((s: {
        name: string;
        price: number;
        qty: number;
      }) => ({
        name: s.name,
        price: s.price,
        qty: Number(s.qty),
      })),
      discounts: (b.booking_discounts ?? []).map((d: {
        description: string | null;
        amount: number;
      }) => ({
        description: d.description,
        amount: d.amount,
      })),
      grandTotal: b.grand_total ?? 0,
    };
  });

  // 4. Tính tổng từ DB values — KHÔNG tính frontend
  const totalGrandTotal = rows.reduce((sum, r) => sum + r.grandTotal, 0);
  const totalPaid = group.paid ?? 0;

  // 5. Lấy ngày check-in sớm nhất và check-out muộn nhất của group
  const checkInDates = bookings.map((b) => b.check_in).sort();
  const checkOutDates = bookings.map((b) => b.check_out).sort();

  const { data: payments, error: paymentsError } = await supabase
    .from('payment_history')
    .select('id, amount, method, date, note')
    .eq('group_id', groupId)
    .order('date', { ascending: true });

  if (paymentsError) {
    throw new Error(`Lỗi query payments: ${paymentsError.message}`);
  }

  return {
    groupId: group.id,
    guestName: group.customer_name ?? '',
    guestPhone: group.customer_phone ?? '',
    source: group.source ?? '',
    otaBookingNumber: group.ota_booking_number ?? undefined,
    checkIn: checkInDates[0],
    checkOut: checkOutDates[checkOutDates.length - 1],
    bookings: rows,
    totalGrandTotal,
    totalPaid,
    payments: (payments ?? []).map((p) => {
      const methodKey = (p.method ?? 'other').toLowerCase();
      const normalizedMethod = PAYMENT_METHOD_LABEL[methodKey] ? methodKey : 'other';
      return {
        id: p.id,
        amount: p.amount,
        method: normalizedMethod,
        date: p.date,
        note: p.note,
      };
    }),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Hook chính ────────────────────────────────────────────────────────────────

export interface UseDocumentGeneratorReturn {
  generating: boolean;
  generate: (opts: GenerateOptions) => Promise<void>;
}

export function useDocumentGenerator(): UseDocumentGeneratorReturn {
  const [generating, setGenerating] = useState(false);

  const generate = async (opts: GenerateOptions): Promise<void> => {
    setGenerating(true);
    try {
      // 1. Fetch data thật từ DB
      const docData = await fetchDocumentData(opts.bookingId, opts.groupId);
      // Gắn lang vào docData — template đọc field này để chọn ngôn ngữ
      if (opts.lang) docData.lang = opts.lang;

      // 2. Render template → { html, zaloText }
      let result: { html: string; zaloText: string };

      switch (opts.docKind) {
        case 'booking_confirmation':
          result = renderBookingConfirmation(docData);
          break;
        case 'deposit_request':
          if (!opts.depositOptions) throw new Error('Thiếu depositOptions cho deposit_request');
          result = renderDepositRequest(docData, opts.depositOptions);
          break;
        case 'deposit_confirmation':
          result = renderDepositConfirmation(docData);
          break;
        case 'invoice':
          result = renderInvoice(docData);
          break;
        case 'arrival_notice':
          result = renderArrivalNotice(docData);
          break;
        default:
          throw new Error('Loại document không hợp lệ');
      }

      // 3. Output theo format
      if (opts.docFormat === 'pdf') {
        const previewTitle = buildPreviewTitle(opts.docKind, docData);
        openDocumentPreview(result.html, previewTitle);
        message.success('Đang mở cửa sổ in PDF…');
        await logDocument(opts, docData, 'print');
      } else {
        // zalo_text
        await copyZaloText(result.zaloText);
        message.success('Đã sao chép nội dung Zalo vào clipboard!');
        await logDocument(opts, docData, 'zalo_clipboard');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      message.error('Không thể tạo document: ' + msg);
      console.error('[useDocumentGenerator]', err);
    } finally {
      setGenerating(false);
    }
  };

  return { generating, generate };
}

// ─── Convenience hook cho 1 booking cụ thể ─────────────────────────────────────
// Dùng trong BookingRow / BookingListPanel để tránh truyền bookingId/groupId mỗi lần

export interface UseBookingDocumentsReturn {
  generating: boolean;
  printConfirmation: () => Promise<void>;
  copyConfirmationZalo: () => Promise<void>;
  printDepositRequest: (depositOpts: DepositRequestOptions) => Promise<void>;
  copyDepositRequestZalo: (depositOpts: DepositRequestOptions) => Promise<void>;
  printDepositConfirmation: () => Promise<void>;
  copyDepositConfirmationZalo: () => Promise<void>;
  printInvoice: () => Promise<void>;
  copyInvoiceZalo: () => Promise<void>;
  printArrivalNotice: () => Promise<void>;
  copyArrivalNoticeZalo: () => Promise<void>;
}

export function useBookingDocuments(
  bookingId: string,
  groupId: string
): UseBookingDocumentsReturn {
  const { generating, generate } = useDocumentGenerator();

  const run = (docKind: DocKind, docFormat: DocFormat, depositOptions?: DepositRequestOptions) =>
    generate({ bookingId, groupId, docKind, docFormat, depositOptions });

  return {
    generating,
    printConfirmation: () => run('booking_confirmation', 'pdf'),
    copyConfirmationZalo: () => run('booking_confirmation', 'zalo_text'),
    printDepositRequest: (o) => run('deposit_request', 'pdf', o),
    copyDepositRequestZalo: (o) => run('deposit_request', 'zalo_text', o),
    printDepositConfirmation: () => run('deposit_confirmation', 'pdf'),
    copyDepositConfirmationZalo: () => run('deposit_confirmation', 'zalo_text'),
    printInvoice: () => run('invoice', 'pdf'),
    copyInvoiceZalo: () => run('invoice', 'zalo_text'),
    printArrivalNotice: () => run('arrival_notice', 'pdf'),
    copyArrivalNoticeZalo: () => run('arrival_notice', 'zalo_text'),
  };
}

// ─── Adapter cho DocumentActionsMenu ───────────────────────────────────────────
// Dùng interface { groupId } + generateAndPrint/generateAndCopyZalo
// Hook này bridge sang useDocumentGenerator bên dưới

interface UseDocumentGeneratorByGroupOptions {
  groupId: string;
}

interface GenerateByGroupParams {
  kind: DocKind;
  bookingId?: string;
  depositAmount?: number;
  depositDeadline?: string;
  /** Ngôn ngữ document: 'vi' (mặc định) | 'en' */
  lang?: 'vi' | 'en';
}

interface UseDocumentGeneratorByGroupReturn {
  isGenerating: boolean;
  zaloText: string | null;
  clearZaloText: () => void;
  generateAndPrint: (params: GenerateByGroupParams) => Promise<void>;
  generateAndCopyZalo: (params: GenerateByGroupParams) => Promise<void>;
}

export function useDocumentGeneratorByGroup(
  { groupId }: UseDocumentGeneratorByGroupOptions
): UseDocumentGeneratorByGroupReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [zaloText, setZaloText] = useState<string | null>(null);

  /** Resolve bookingId: dùng param nếu có, không thì query booking đầu tiên của group */
  async function resolveBookingId(paramBookingId?: string): Promise<string> {
    if (paramBookingId) return paramBookingId;
    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('group_id', groupId)
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
      .order('check_in', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) throw new Error('Không tìm thấy booking trong group');
    return data.id;
  }

  async function run(params: GenerateByGroupParams, format: DocFormat): Promise<string | null> {
    setIsGenerating(true);
    try {
      const bookingId = await resolveBookingId(params.bookingId);
      const docData = await fetchDocumentData(bookingId, groupId);
      // Gắn lang — forward từ caller
      if (params.lang) docData.lang = params.lang;

      let result: { html: string; zaloText: string };

      switch (params.kind) {
        case 'booking_confirmation':
          result = renderBookingConfirmation(docData);
          break;
        case 'deposit_request': {
          // Nếu không truyền amount → 30% grand_total
          const amount = params.depositAmount ?? Math.round(docData.grandTotal * 0.3);
          const deadline = params.depositDeadline ?? dayjs().add(1, 'day').format('YYYY-MM-DD');
          result = renderDepositRequest(docData, { depositAmount: amount, deadline });
          break;
        }
        case 'deposit_confirmation':
          result = renderDepositConfirmation(docData);
          break;
        case 'invoice':
          result = renderInvoice(docData);
          break;
        case 'arrival_notice':
          result = renderArrivalNotice(docData);
          break;
        default:
          throw new Error('Loại document không hợp lệ');
      }

      const sentVia = format === 'pdf' ? 'print' : 'zalo_clipboard';
      await logDocument(
        { bookingId, groupId, docKind: params.kind, docFormat: format },
        docData,
        sentVia
      );

      if (format === 'pdf') {
        const previewTitle = buildPreviewTitle(params.kind, docData);
        openDocumentPreview(result.html, previewTitle);
        message.success('Đang mở cửa sổ in PDF…');
        return null;
      }

      await copyZaloText(result.zaloText);
      message.success('Đã sao chép nội dung Zalo vào clipboard!');
      return result.zaloText;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      message.error('Không thể tạo document: ' + msg);
      console.error('[useDocumentGeneratorByGroup]', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }

  return {
    isGenerating,
    zaloText,
    clearZaloText: () => setZaloText(null),
    generateAndPrint: async (params) => { await run(params, 'pdf'); },
    generateAndCopyZalo: async (params) => {
      const text = await run(params, 'zalo_text');
      if (text) setZaloText(text);
    },
  };
}
