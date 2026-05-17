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
import {
  renderBookingConfirmation,
  renderDepositRequest,
  renderDepositConfirmation,
  renderInvoice,
  renderArrivalNotice,
} from './documentTemplates';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocKind =
  | 'booking_confirmation'
  | 'deposit_request'
  | 'deposit_confirmation'
  | 'invoice'
  | 'arrival_notice';

export type DocFormat = 'pdf' | 'zalo_text';

export interface GenerateOptions {
  bookingId: string;
  groupId: string;
  docKind: DocKind;
  docFormat: DocFormat;
  /** Chỉ cần khi docKind === 'deposit_request' */
  depositOptions?: DepositRequestOptions;
}

// ─── Query helpers ─────────────────────────────────────────────────────────────

/** Query toàn bộ data cần thiết cho 1 booking */
async function fetchDocumentData(
  bookingId: string,
  groupId: string
): Promise<DocumentData> {
  // Booking + room (JOIN thủ công vì không có foreign key tới rooms table)
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select(`
      id, group_id, room_id, check_in, check_out, nights,
      price, surcharge, grand_total, tax_rate, tax_amount,
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

  // Services
  const { data: services = [] } = await supabase
    .from('booking_services')
    .select('name, price, qty')
    .eq('booking_id', bookingId);

  // Discounts
  const { data: discounts = [] } = await supabase
    .from('booking_discounts')
    .select('description, amount')
    .eq('booking_id', bookingId);

  // Payments của group
  const { data: payments = [] } = await supabase
    .from('payments')
    .select('amount, method, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

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
    pricePerNight: booking.nights > 0 ? Math.round(booking.price / booking.nights) : booking.price,
    surcharge: booking.surcharge ?? 0,
    grandTotal: booking.grand_total,
    services: (services ?? []).map(s => ({
      name: s.name,
      price: s.price,
      qty: Number(s.qty),
    })),
    discounts: (discounts ?? []).map(d => ({
      description: d.description,
      amount: d.amount,
    })),
    paid: group.paid ?? 0,
    payments: (payments ?? []).map(p => ({
      amount: p.amount,
      method: p.method,
      created_at: p.created_at,
    })),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Render HTML trong iframe ẩn → window.print() ─────────────────────────────

function printHtml(html: string): void {
  // Tạo iframe ẩn để print mà không rời trang
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();

  // Đợi load xong mới print
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Xóa iframe sau khi print dialog đóng
    setTimeout(() => document.body.removeChild(iframe), 1000);
  };
}

// ─── Copy Zalo text vào clipboard ─────────────────────────────────────────────

async function copyZaloText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// ─── Ghi log vào document_logs ────────────────────────────────────────────────

async function logDocument(
  opts: GenerateOptions,
  docData: DocumentData,
  sentVia: string
): Promise<void> {
  // Map docFormat → format enum DB dùng
  const dbFormat = opts.docFormat === 'pdf' ? 'pdf' : 'zalo_text';

  // content_snapshot: lưu data tại thời điểm generate (bất biến kể cả sau khi booking sửa)
  const snapshot = {
    guestName: docData.guestName,
    roomName: docData.roomName,
    checkIn: docData.checkIn,
    checkOut: docData.checkOut,
    nights: docData.nights,
    grandTotal: docData.grandTotal,
    paid: docData.paid,
    generatedAt: docData.generatedAt,
  };

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

// ─── Hook chính ───────────────────────────────────────────────────────────────

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
        printHtml(result.html);
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

// ─── Convenience hook cho 1 booking cụ thể ────────────────────────────────────
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

// ─── Adapter cho DocumentActionsMenu ─────────────────────────────────────────
// Copilot dùng interface { groupId } + generateAndPrint/generateAndCopyZalo
// Hook này bridge sang useDocumentGenerator bên dưới

interface UseDocumentGeneratorByGroupOptions {
  groupId: string;
}

interface GenerateByGroupParams {
  kind: DocKind;
  bookingId?: string;       // nếu không truyền → lấy booking đầu tiên của group
  depositAmount?: number;
  depositDeadline?: string; // 'YYYY-MM-DD'
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
        printHtml(result.html);
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