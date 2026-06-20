// src/features/documents/documentLogging.ts
// Helpers ghi log document_logs, copy Zalo text, build title preview window.
// Tách từ useDocumentGenerator.ts (M4 — file splitting, không đổi logic).

import { supabase } from '@/api/supabase';
import type { DocumentData } from './documentTemplates';
import { DOC_KIND_LABELS } from './documentTemplates';
import type { DocKind, GenerateOptions } from './documentGeneratorTypes';
import type { DocumentPreviewData } from './documentDataFetchers';

export function buildPreviewTitle(kind: DocKind, docData: DocumentPreviewData): string {
  const previewTitle = `${DOC_KIND_LABELS[kind]} — ${docData.group.guest_name ?? 'Khach'} | ${
    docData.bookings.map(b => `P.${b.room_id}`).join(', ')
  }`;
  return previewTitle;
}

// ─── Copy Zalo text vào clipboard ──────────────────────────────────────────────

export async function copyZaloText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// ─── Ghi log vào document_logs ─────────────────────────────────────────────────

export async function logDocument(
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
