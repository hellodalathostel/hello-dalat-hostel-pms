# M4 Fix — File splitting (3 file lớn → 12 file nhỏ)

Khối lượng quá lớn để diễn đạt qua diff từng đoạn — hướng dẫn này dùng **full file
replace/create**. Mỗi file trong `m4-files/` tương ứng 1-1 với đường dẫn đích trong
repo. Copy y nguyên nội dung, không tự sửa thêm gì.

## Tổng quan thay đổi

### Nhóm 1 — documentTemplates.ts (1973 dòng → barrel 34 dòng + 4 file con)
| File nguồn (m4-files/) | Đích trong repo | Vai trò |
|---|---|---|
| `documentTemplates.ts` | `src/features/documents/documentTemplates.ts` | Barrel re-export — giữ nguyên API public |
| `templates/shared.ts` | `src/features/documents/templates/shared.ts` | Types, constants, CSS, helpers chung |
| `templates/singleBookingTemplates.ts` | `src/features/documents/templates/singleBookingTemplates.ts` | 5 template đơn (confirmation/deposit×2/invoice/arrival) |
| `templates/labels.ts` | `src/features/documents/templates/labels.ts` | DOC_KIND_LABELS / DOC_KIND_LABELS_EN |
| `templates/groupTemplates.ts` | `src/features/documents/templates/groupTemplates.ts` | 3 template nhóm (invoice/confirmation/zalo deposit) |

### Nhóm 2 — useDocumentGenerator.ts (715 dòng → 362 dòng + 3 file con)
| File nguồn (m4-files/) | Đích trong repo | Vai trò |
|---|---|---|
| `useDocumentGenerator.ts` | `src/features/documents/useDocumentGenerator.ts` | 3 hook chính (rút gọn) |
| `documentGeneratorTypes.ts` | `src/features/documents/documentGeneratorTypes.ts` | DocKind/DocFormat/GenerateOptions |
| `documentDataFetchers.ts` | `src/features/documents/documentDataFetchers.ts` | fetchDocumentData + fetchGroupDocumentData |
| `documentLogging.ts` | `src/features/documents/documentLogging.ts` | logDocument/copyZaloText/buildPreviewTitle |

### Nhóm 3 — BookingDetailDrawer.tsx (721 dòng → 433 dòng + 2 file con)
| File nguồn (m4-files/) | Đích trong repo | Vai trò |
|---|---|---|
| `bookings-components/BookingDetailDrawer.tsx` | `src/features/bookings/components/BookingDetailDrawer.tsx` | Component chính (rút gọn) |
| `bookings-components/BookingRoomCard.tsx` | `src/features/bookings/components/BookingRoomCard.tsx` | Sub-component hiển thị 1 booking trong group |
| `bookings-components/bookingDetailShared.ts` | `src/features/bookings/components/bookingDetailShared.ts` | Constants/types chung (STATUS_COLOR, formatVND, v.v.) |

## Bước thực hiện

1. Tạo 2 folder mới nếu chưa có:
   ```bash
   mkdir -p src/features/documents/templates
   ```
   (`src/features/bookings/components/` đã tồn tại sẵn.)

2. Copy đè/tạo từng file theo bảng trên — **toàn bộ nội dung file**, không chỉnh sửa.

3. Verify không còn file rác — KHÔNG có file `.bak` hay file tạm nào sau khi copy xong.

## Đã verify trước khi giao (không cần làm lại, chỉ để tham khảo nếu nghi ngờ)

- **Named exports khớp 100%** giữa file gốc và sau khi tách (đã cross-check bằng
  grep từng symbol export).
- **Không có circular import thật** — duy nhất 1 cặp type-only circular giữa
  `documentTemplates.ts` (barrel) và `documentGeneratorTypes.ts` qua `DocKind`,
  đây vốn đã tồn tại trong code gốc dưới dạng khác và TypeScript cho phép vô điều
  kiện vì `import type`/`export type` bị erase lúc compile.
- **Brace balance khớp** ở tất cả 12 file (đếm `{` và `}` bằng grep).
- **Dòng tương ứng test thật:**
  - `documentTemplates.ts`: tổng dòng 4 file con + barrel ≈ tổng dòng gốc.
  - `useDocumentGenerator.ts`: tổng dòng 4 file con ≈ tổng dòng gốc (chênh do thêm
    header comment).
  - `BookingDetailDrawer.tsx`: 36+283+433 = 752 dòng so với 721 dòng gốc (chênh do
    thêm header comment + sửa 2 dynamic-import xấu thành type tĩnh).
- **2 cải tiến nhỏ kèm theo** (không đổi hành vi, chỉ code quality):
  - `BookingRoomCard.tsx`: sửa 2 chỗ dùng `import('@/features/...').TypeName` inline
    trong JSX map callback thành import tĩnh ở đầu file (`BookingServiceItem`,
    `BookingDiscountItem`).
  - Mọi `const`/helper trong `templates/shared.ts` được thêm `export` (trước đây
    là module-private trong file gốc, giờ cần export để các file con khác dùng).

## Phát hiện ngoài phạm vi M4 (không sửa, chỉ ghi nhận để biết)

- `useBookingDocuments` (trong `useDocumentGenerator.ts`) **không được import ở
  đâu khác trong codebase** — có thể là dead code hoặc tính năng chưa hoàn thiện.
  Không xóa vì M4 chỉ tách file, không đổi logic/dọn dead code.

## Sau khi áp dụng
- Chạy `tsc --noEmit` hoặc `tsc -b` để confirm không lỗi type — đặc biệt chú ý
  các đường dẫn import tương đối (`./templates/shared`, `./bookingDetailShared`,
  `./BookingRoomCard`) đúng case-sensitive trên hệ điều hành CI (Linux).
- Test UI thực tế ở các trang dùng `BookingDetailDrawer`: `BookingsPage`,
  `DashboardPage`, `RoomCalendarPage` — mở chi tiết 1 booking, kiểm tra hiển thị
  đúng, các action button (check-in/out, dịch vụ, early/late, huỷ, xoá) hoạt động.
- Test thử generate 1 document mỗi loại (booking_confirmation, invoice,
  group_invoice...) để đảm bảo barrel re-export hoạt động đúng.
- Commit: `refactor: split documentTemplates, useDocumentGenerator, BookingDetailDrawer into smaller files (M4)`
