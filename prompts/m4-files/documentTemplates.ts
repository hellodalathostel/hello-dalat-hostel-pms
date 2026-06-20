// src/features/documents/documentTemplates.ts
// Barrel re-export — giữ nguyên API public sau khi tách file (M4 — file splitting).
// Nội dung thật nằm trong ./templates/{shared,singleBookingTemplates,labels,groupTemplates}.ts
// Mọi import hiện có từ '@/features/documents/documentTemplates' tiếp tục hoạt động
// không cần sửa gì ở nơi gọi (useDocumentGenerator.ts, DocumentActionsMenu.tsx).

export type {
  BookingServiceItem,
  BookingDiscountItem,
  PaymentItem,
  GroupBookingRow,
  GroupDocumentData,
  DocumentData,
} from './templates/shared';

export type { DepositRequestOptions } from './templates/singleBookingTemplates';

export {
  renderBookingConfirmation,
  renderDepositRequest,
  renderDepositConfirmation,
  renderInvoice,
  renderArrivalNotice,
} from './templates/singleBookingTemplates';

export { DOC_KIND_LABELS, DOC_KIND_LABELS_EN } from './templates/labels';

export {
  renderGroupInvoice,
  renderGroupConfirmation,
  generateGroupZaloDeposit,
} from './templates/groupTemplates';

export type { DocKind } from './documentGeneratorTypes';
