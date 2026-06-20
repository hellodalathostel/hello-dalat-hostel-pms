// src/features/documents/templates/labels.ts
// Nhãn hiển thị cho từng loại document (VI/EN). Tách từ documentTemplates.ts (M4).

import type { DocKind } from '../documentGeneratorTypes';

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  booking_confirmation:  'Xác nhận đặt phòng',
  deposit_request:       'Yêu cầu đặt cọc',
  deposit_confirmation:  'Xác nhận nhận cọc',
  invoice:               'Hóa đơn',
  arrival_notice:        'Thông báo check-in',
  group_invoice:         'Hóa đơn tổng hợp',
  group_confirmation:    'Xác nhận đặt phòng (Đoàn)',
  group_deposit_request: 'Yêu cầu đặt cọc (Đoàn)',
};

export const DOC_KIND_LABELS_EN: Record<DocKind, string> = {
  booking_confirmation:  'Booking Confirmation',
  deposit_request:       'Deposit Request',
  deposit_confirmation:  'Deposit Receipt',
  invoice:               'Invoice',
  arrival_notice:        'Pre-arrival Notice',
  group_invoice:         'Group Invoice',
  group_confirmation:    'Group Booking Confirmation',
  group_deposit_request: 'Group Deposit Request',
};

