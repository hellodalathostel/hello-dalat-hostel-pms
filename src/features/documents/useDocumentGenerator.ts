// src/features/documents/useDocumentGenerator.ts
// Hook chính điều phối toàn bộ flow tạo document:
//   1. Query data từ Supabase (bookings + groups + rooms + services + discounts + payments)
//   2. Build DocumentData object
//   3. Gọi template function tương ứng
//   4. Trigger print (PDF) hoặc copy text (Zalo)
//   5. Log vào document_logs qua RPC create_document_log
//
// M4 — file splitting: query helpers tách sang documentDataFetchers.ts,
// logging/preview helpers sang documentLogging.ts, types chung sang
// documentGeneratorTypes.ts. File này chỉ còn 3 hook chính.

import { useState } from 'react';
import dayjs from 'dayjs';
import { supabase } from '@/api/supabase';
import { useAppFeedback } from '@/shared/hooks/useAppFeedback';
import {
  renderBookingConfirmation,
  renderDepositRequest,
  renderDepositConfirmation,
  renderInvoice,
  renderArrivalNotice,
  renderGroupInvoice,
  renderGroupConfirmation,
  generateGroupZaloDeposit,
  DOC_KIND_LABELS,
} from './documentTemplates';
import { openDocumentPreview } from './DocumentPreviewWindow';
import { fetchDocumentData, fetchGroupDocumentData } from './documentDataFetchers';
import { buildPreviewTitle, copyZaloText, logDocument } from './documentLogging';
import type { DocKind, DocFormat, GenerateOptions } from './documentGeneratorTypes';

export type { DocKind, DocFormat, GenerateOptions };

// ─── Hook chính ────────────────────────────────────────────────────────────────

export interface UseDocumentGeneratorReturn {
  generating: boolean;
  generate: (opts: GenerateOptions) => Promise<void>;
}

export function useDocumentGenerator(): UseDocumentGeneratorReturn {
  const [generating, setGenerating] = useState(false);
  const { message } = useAppFeedback();

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
  const { message } = useAppFeedback();

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
        case 'group_invoice': {
          // Fetch đủ tất cả bookings trong group — không chỉ 1 booking
          const groupData = await fetchGroupDocumentData(groupId);
          const lang = params.lang ?? 'vi';
          const html = renderGroupInvoice(groupData, lang);
          openDocumentPreview(html, DOC_KIND_LABELS['group_invoice']);
          message.success('Đang mở cửa sổ in PDF…');
          // Log với đúng signature của create_document_log RPC
          const snapshot = {
            guestName: groupData.guestName,
            checkIn: groupData.checkIn,
            checkOut: groupData.checkOut,
            totalGrandTotal: groupData.totalGrandTotal,
            totalPaid: groupData.totalPaid,
            roomCount: groupData.bookings.length,
            generatedAt: groupData.generatedAt,
          };
          const { error: logErr1 } = await supabase.rpc('create_document_log', {
            p_group_id: groupId,
            p_booking_id: null,
            p_doc_type: 'group_invoice',
            p_doc_format: 'pdf',
            p_content_snapshot: snapshot,
            p_sent_via: 'print',
            p_recipient_name: groupData.guestName,
            p_recipient_phone: groupData.guestPhone || null,
            p_note: null,
          });
          // Log lỗi nhưng không throw — document đã render/in thành công rồi
          if (logErr1) console.error('[useDocumentGeneratorByGroup] Lỗi ghi log group_invoice:', logErr1.message);
          return null;
        }

        case 'group_confirmation': {
          const groupData = await fetchGroupDocumentData(groupId);
          const lang = params.lang ?? 'vi';
          const html = renderGroupConfirmation(groupData, lang);
          openDocumentPreview(html, DOC_KIND_LABELS['group_confirmation']);
          message.success('Đang mở cửa sổ in PDF…');
          // Log với đúng signature của create_document_log RPC
          const snapshot = {
            guestName: groupData.guestName,
            checkIn: groupData.checkIn,
            checkOut: groupData.checkOut,
            totalGrandTotal: groupData.totalGrandTotal,
            totalPaid: groupData.totalPaid,
            roomCount: groupData.bookings.length,
            generatedAt: groupData.generatedAt,
          };
          const { error: logErr2 } = await supabase.rpc('create_document_log', {
            p_group_id: groupId,
            p_booking_id: null,
            p_doc_type: 'group_confirmation',
            p_doc_format: 'pdf',
            p_content_snapshot: snapshot,
            p_sent_via: 'print',
            p_recipient_name: groupData.guestName,
            p_recipient_phone: groupData.guestPhone || null,
            p_note: null,
          });
          if (logErr2) console.error('[useDocumentGeneratorByGroup] Lỗi ghi log group_confirmation:', logErr2.message);
          return null;
        }

        case 'group_deposit_request': {
          const groupData = await fetchGroupDocumentData(groupId);
          const depositAmount = params.depositAmount ?? 0;
          const zaloMsg = generateGroupZaloDeposit(groupData, depositAmount);
          await copyZaloText(zaloMsg);
          message.success('Đã sao chép nội dung Zalo vào clipboard!');
          setZaloText(zaloMsg);
          // Bug fix (M2): RPC create_document_log không có params p_doc_kind/p_lang —
          // signature thật là p_doc_type/p_doc_format/p_content_snapshot/... Lệnh gọi
          // cũ chạy "thành công" vì mọi param có default, nhưng ghi log sai hoàn toàn
          // (luôn ghi doc_type='booking_confirmation', format='pdf', mất snapshot).
          const snapshot = {
            guestName: groupData.guestName,
            checkIn: groupData.checkIn,
            checkOut: groupData.checkOut,
            totalGrandTotal: groupData.totalGrandTotal,
            totalPaid: groupData.totalPaid,
            depositAmount,
            roomCount: groupData.bookings.length,
            generatedAt: groupData.generatedAt,
          };
          const { error: logErr3 } = await supabase.rpc('create_document_log', {
            p_group_id: groupId,
            p_booking_id: null,
            p_doc_type: 'group_deposit_request',
            p_doc_format: 'zalo_text',
            p_content_snapshot: snapshot,
            p_sent_via: 'zalo_clipboard',
            p_recipient_name: groupData.guestName,
            p_recipient_phone: groupData.guestPhone || null,
            p_note: null,
          });
          if (logErr3) console.error('[useDocumentGeneratorByGroup] Lỗi ghi log group_deposit_request:', logErr3.message);
          return zaloMsg;
        }

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
