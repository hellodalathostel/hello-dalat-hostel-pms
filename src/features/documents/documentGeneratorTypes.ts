// src/features/documents/documentGeneratorTypes.ts
// Types chung dùng bởi useDocumentGenerator.ts, documentDataFetchers.ts,
// và documentLogging.ts. Tách riêng để tránh circular import giữa các file
// con sau khi split (M4 — file splitting).

import type { DepositRequestOptions } from './templates/singleBookingTemplates';

export type DocKind =
  | 'booking_confirmation'
  | 'deposit_request'
  | 'deposit_confirmation'
  | 'invoice'
  | 'arrival_notice'
  | 'group_invoice'
  | 'group_confirmation'
  | 'group_deposit_request';

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
