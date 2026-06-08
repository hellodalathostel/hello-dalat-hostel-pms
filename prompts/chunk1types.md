# TASK: Group Documents — Chunk 1/3: Types & GroupDocumentData

## Context
File: `src/features/documents/documentTemplates.ts`
Feature: Thêm types + render functions cho group documents (nhiều phòng, 1 group).

## Yêu cầu chính xác

### 1. Thêm interface `GroupBookingRow` (sau `PaymentItem`):
```ts
export interface GroupBookingRow {
  bookingId: string;
  roomName: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pricePerNight: number;
  roomSubtotal: number;
  surcharge: number;
  services: BookingServiceItem[];
  discounts: BookingDiscountItem[];
  grandTotal: number;
}
```

### 2. Thêm interface `GroupDocumentData` (sau `GroupBookingRow`):
```ts
export interface GroupDocumentData {
  groupId: string;
  guestName: string;
  guestPhone: string;
  source: string;
  otaBookingNumber?: string;
  checkIn: string;       // earliest check_in trong group
  checkOut: string;      // latest check_out trong group
  bookings: GroupBookingRow[];
  totalGrandTotal: number;  // SUM(booking.grandTotal)
  totalPaid: number;
  payments: PaymentItem[];
  generatedAt: string;
  lang?: 'vi' | 'en';
}
```

### 3. Thêm vào `DocKind` type (trong `useDocumentGenerator.ts`):
Thêm `'group_invoice'` vào union type `DocKind`.
File: `src/features/documents/useDocumentGenerator.ts`

### 4. Thêm vào `DOC_KIND_LABELS` (trong `documentTemplates.ts`):
```ts
group_invoice: 'Hóa đơn tổng hợp',
```

### 5. Thêm 3 render functions mới vào cuối `documentTemplates.ts`:

#### `renderGroupBookingConfirmation(data: GroupDocumentData): { html: string; zaloText: string }`
- HTML: cùng style boutique (forest green `#2d6a4f`) như `renderBookingConfirmation`
- Hiển thị header group (tên khách, phone, source)
- Table liệt kê từng phòng: Phòng | Check-in | Check-out | Số đêm | Giá/đêm | Thành tiền
- Subtotal mỗi phòng, surcharge nếu có
- Tổng cộng (`totalGrandTotal`), đã thanh toán, còn lại
- Bảng lịch sử thanh toán (`payments`)
- Support `lang: 'vi' | 'en'` — dùng pattern đã có trong file (check `d.lang === 'en'`)
- zaloText: format text thuần (không HTML), liệt kê từng phòng rõ ràng

#### `renderGroupDepositRequest(data: GroupDocumentData, opts: DepositRequestOptions): { html: string; zaloText: string }`
- Tương tự `renderDepositRequest` nhưng nhận `GroupDocumentData`
- Table phòng giống `renderGroupBookingConfirmation`
- Tổng tiền cọc = `opts.depositAmount`, deadline = `opts.deadline`
- VietQR dùng `totalGrandTotal` (hoặc `opts.depositAmount`)
- Support `lang`

#### `renderGroupInvoice(data: GroupDocumentData): { html: string; zaloText: string }`
- Tương tự `renderInvoice` nhưng nhận `GroupDocumentData`
- Table phòng + dịch vụ riêng từng phòng (nếu có `services` trong `GroupBookingRow`)
- Tổng cộng, đã thanh toán, còn lại
- Support `lang`

## Rules
- Không sửa bất kỳ function nào đã có
- Không thay đổi `DocumentData` interface
- Dùng helpers đã có: `fmtVND`, `fmtDate_VI`, `fmtDate_EN`, `fmtVND_EN`, `fmtDateTime_VI`, `fmtDateTime_EN`, `vietQrUrl`, `removeDiacritics`
- Comment tiếng Việt
- Không pseudo-code, không placeholder

## Sau khi xong
Báo "Chunk 1 done" + liệt kê:
- Các interfaces đã thêm
- Các functions đã thêm
- Dòng số gần đúng trong file