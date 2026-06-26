# Audit Report — 2026-06-26 09:30 ICT

## Tóm tắt
- Tổng số file quét: ~145 (130 TS/TSX trong `src/`, 13 Edge Function files, `supabase/migrations/` bỏ qua per prompt)
- Nhóm 1 (dead code): **7 vấn đề** (4 orphan files, 1 legacy view, 1 duplicate implementation, 1 duplicate VND formatter pattern)
- Nhóm 2 (file cần tách): **10 file** >300 dòng
- Nhóm 3 (vi phạm nguyên tắc): **15 vấn đề** — nhiều nhất ở NT#3.7 (antd message import) và NT#3.4 (business logic trong Edge Functions)

---

## Nhóm 1 — Dead code / Legacy

| File | Loại vấn đề | Mô tả ngắn | Mức độ |
|------|------------|-----------|--------|
| `src/components/booking/BookingImportPDF.tsx` (269 dòng) | Orphan file | Không được import ở đâu trong codebase. Bản active là `src/features/bookings/components/BookingImportPDF.tsx`. | **Cao** |
| `src/components/checkin/KBTTImportModal.tsx` (317 dòng) | Orphan file | Không được import ở đâu trong router hoặc features. Export `KBTTImportModal` zero references ngoài chính file đó. | **Cao** |
| `src/pages/RevenueDashboard.tsx` (276 dòng) | Orphan file | Router dùng `RevenueDashboardPage` từ `src/features/dashboard/pages/RevenueDashboardPage.tsx`. File này zero references. | **Cao** |
| `src/utils/parseKBTTExcel.ts` | Orphan file (transitive) | Chỉ được import bởi `KBTTImportModal.tsx` — chính file đó là orphan. Cả chuỗi không dùng. | **Cao** |
| `src/features/finance/hooks/useRevenue.ts:37` | Legacy view name | `.from('monthly_revenue')` — CLAUDE.md quy định phải dùng `finance_monthly_revenue`, không dùng `monthly_revenue`. View cũ có thể bị remove. | **Cao** |
| `src/shared/utils/parseCheckinExcel.ts` (313 dòng) | Duplicate implementation | Trùng lặp với `src/features/checkin/utils/parseCheckinExcel.ts` (358 dòng). `useCheckinImport.ts` dùng version features, không dùng shared version. Shared version được re-export qua `shared/utils/index.ts` nhưng không có consumer. | **Trung** |
| VND formatter — 15+ nơi | Duplicate logic | `new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)` và `.toLocaleString('vi-VN')` viết lại ở: `bookingDetailShared.ts:35`, `BookingImportPDF.tsx:188`, `BookingFolioEditModal.tsx:40`, `ServiceSection.tsx:8`, `BookingsPage.tsx:44`, `CheckoutModal.tsx:27`, `QuickCheckoutModal.tsx:38`, `RoomCard.tsx:40`, `RevenueDashboardPage.tsx:20`, `GuestDetailDrawer.tsx:28`, `RevenueKPICards.tsx:12`, `TaxThresholdBanner.tsx:9`, `S1aPage.tsx:13`, `RoomBoard.tsx:19`, `groupTemplates.ts:82`, v.v. Đã có `bookingDetailShared.ts:35` làm utility nhưng không được dùng chung. | **Thấp** |

---

## Nhóm 2 — File cần tách

| File | Số dòng | Số trách nhiệm | Đề xuất tách thành |
|------|---------|----------------|---------------------|
| `src/features/documents/templates/singleBookingTemplates.ts` | 907 | 2 — nhiều template HTML khác nhau (confirmation, invoice, receipt, tourist card) gộp chung | Tách theo loại document: `confirmationTemplate.ts`, `invoiceTemplate.ts`, `receiptTemplate.ts`, `touristCardTemplate.ts` |
| `src/features/documents/templates/groupTemplates.ts` | 699 | 2 — nhiều template group-level gộp chung | Tách theo loại: `groupInvoiceTemplate.ts`, `groupConfirmationTemplate.ts`, `groupDepositTemplate.ts` |
| `src/features/bookings/pages/NewBookingPage.tsx` | 589 | 4 — (1) form state quản lý rooms/dates, (2) service/discount/deposit line items, (3) PDF import parsing, (4) submit → RPC call | Tách `useNewBookingForm` (form state + submit), `ServiceDiscountDepositPanel` (line items), giữ page component nhỏ |
| `src/features/bookings/components/BookingFolioEditModal.tsx` | 497 | 3 — (1) render folio table với tất cả bookings, (2) void payment flow, (3) edit booking price form | Tách `FolioTable`, `VoidPaymentConfirm`, giữ modal wrapper |
| `src/features/bookings/components/BookingDetailDrawer.tsx` | 433 | 3 — (1) render booking info + group summary, (2) quản lý state của 6 child modal/drawer, (3) action buttons | **12 useState** — tách `useBookingDetailModals()` để quản lý open/close state của tất cả child modals |
| `src/features/documents/templates/shared.ts` | 403 | 3 — (1) shared VND/date formatters, (2) type definitions, (3) shared HTML layout primitives | Tách `templateTypes.ts` (types), `templateFormatters.ts` (fmt functions), giữ `shared.ts` cho layout |
| `src/features/calendar/hooks/useRoomCalendar.ts` | 362 | 3 — (1) fetch room_calendar view, (2) date range / column generation, (3) layout calculation cho timeline | Tách `useCalendarLayout` (date columns), giữ data fetch trong `useRoomCalendar` |
| `src/features/checkout/components/CheckoutModal.tsx` | 360 | 3 — (1) folio review step, (2) payment method form step, (3) confirmation step | Tách 3 step thành sub-components: `FolioStep`, `PaymentStep`, `ConfirmStep` |
| `src/features/checkin/utils/parseCheckinExcel.ts` | 358 | 3 — (1) header detection + format detection, (2) VN-format row parsing, (3) NNN-format row parsing | Tách `detectCheckinFormat.ts`, `parseVNRow.ts`, `parseNNNRow.ts` — hoặc merge với/xóa `src/shared/utils/parseCheckinExcel.ts` |
| `src/pages/BookPage.tsx` | 350 | N/A | **Orphan** — xem Nhóm 1. Nếu vẫn cần, move vào `src/features/bookings/pages/`. |

---

## Nhóm 3 — Vi phạm nguyên tắc

| Nguyên tắc # | File:Dòng | Mô tả vi phạm | Mức độ |
|--------------|-----------|---------------|--------|
| 3.1 | `src/features/bookings/hooks/useBookingDetail.ts:143,145` | `grandTotal = bookingRows.reduce(sum, b => sum + b.grand_total, 0)` và `balanceDue = grandTotal - paid` — tính group total + balance_due ở frontend thay vì đọc từ DB view | Cần xác nhận |
| 3.1 | `src/features/bookings/hooks/useBookingsList.ts:72,84` | `grandTotal = activeBookings.reduce(...)` và `balance_due: grandTotal - group.paid` — cùng pattern | Cần xác nhận |
| 3.1 | `src/features/dashboard/hooks/useBookingDetail.ts:288` | `balance_due: (bookingData.grand_total ?? 0) - (group.paid ?? 0)` | Cần xác nhận |
| 3.2 | `src/features/booking-requests/hooks/useBookingRequests.ts:80-83` | `.from('booking_requests').update({ status: 'rejected', ... })` — direct UPDATE thay vì RPC. `booking_requests` là bảng nghiệp vụ (có trigger `confirm_booking_request_txn` cho confirm path). | **Trung** |
| 3.2 | `src/features/settings/hooks/useRoomMutations.ts:41,66,86` | `.from('rooms').insert(...)` và `.from('rooms').update(...)` — direct write. `rooms` không nằm trong danh sách cấm của CLAUDE.md (bookings/payment_history/booking_guests) nhưng là bảng nghiệp vụ có triggers. | Cần xác nhận |
| 3.3 | `src/features/layout/components/BottomNav.tsx:68` | `role === 'owner'` để filter `ownerOnly` nav items — UI-level role check không thuộc 2 exception đã xác nhận. | Cần xác nhận |
| 3.3 | `src/features/settings/components/RoomManagementPanel.tsx:16,79,111` | `isOwner = role === 'owner'` để ẩn action buttons và "Thêm phòng". Không phải `app_users` hay `void_checkedout_booking_txn`. | Cần xác nhận |
| 3.4 | `supabase/functions/daily-revenue-summary/index.ts:49-114` | Tính `totalRevenue`, `revenueByMethod`, `occupancyPct = occupiedRooms / TOTAL_ROOMS * 100` với `TOTAL_ROOMS = 8` hardcoded. Business logic (occupancy, revenue breakdown) nên ở DB view/RPC, không ở Edge Function. | **Trung** |
| 3.4 | `supabase/functions/daily-room-report/index.ts:139-156` | Tính `totalRevenue`, `revenueByMethod`, `occupancyPct` với `TOTAL_ROOMS = 8` hardcoded — duplicate của daily-revenue-summary. | **Trung** |
| 3.4 | `supabase/functions/price-alert-bot/index.ts:101,115` | `diffPct = (suggestedPrice - currentPrice) / currentPrice * 100` và so sánh với `ALERT_THRESHOLD_PCT = 10` — business rule về threshold giá nằm trong Edge Function. | **Thấp** |
| 3.4 | `supabase/functions/daily-revenue/index.ts:33` | `total = data?.reduce((sum, b) => sum + b.grand_total, 0)` — aggregate trực tiếp trong Edge Function, không qua RPC/view. | **Thấp** |
| 3.6 | `src/features/checkin/utils/parseCheckinExcel.ts:261-264,276,343` | 5 `console.log` calls không có `import.meta.env.DEV` guard. Dòng 262 log `headers` (tên cột — không phải giá trị PII). Dòng 276,343 log số lượng rows. Không log PII trực tiếp nhưng thiếu guard. | **Thấp** |
| 3.7 | `src/features/booking-requests/hooks/useBookingRequests.ts:2` | `import { message } from 'antd'` — vi phạm quy ước useAppFeedback. Dùng ở `onSuccess:95`, `onError:98`, `onError:144,148,152`. | **Trung** |
| 3.7 | `src/features/documents/useDocumentGenerator.ts:14` | `import { message } from 'antd'` — vi phạm quy ước useAppFeedback. | **Trung** |
| 3.7 | `src/hooks/useAddRoomToGroup.ts:2` | `import { message } from 'antd'` — vi phạm quy ước useAppFeedback. | **Trung** |

---

## Đề xuất thứ tự xử lý

1. **[Cao - ngay]** `src/features/finance/hooks/useRevenue.ts:37` — Đổi `monthly_revenue` → `finance_monthly_revenue`. View cũ có thể bị drop bất kỳ lúc nào.

2. **[Cao - ngay]** Xóa 4 orphan files: `src/components/booking/BookingImportPDF.tsx`, `src/components/checkin/KBTTImportModal.tsx`, `src/pages/RevenueDashboard.tsx`, `src/utils/parseKBTTExcel.ts`. Mỗi file là dead code rõ ràng, xác nhận lại bằng grep trước khi xóa.

3. **[Trung - sprint sau]** Fix 3 vi phạm `import { message } from 'antd'` (NT#3.7): `useBookingRequests.ts`, `useDocumentGenerator.ts`, `useAddRoomToGroup.ts`. Thay bằng `useAppFeedback`.

4. **[Trung - cần quyết định từ Lead Dev]** NT#3.2 — `booking_requests` direct `.update()` cho reject: Cân nhắc tạo RPC `reject_booking_request_txn` để nhất quán với confirm path đã có RPC.

5. **[Trung - cần quyết định từ Lead Dev]** NT#3.4 — `TOTAL_ROOMS = 8` hardcoded trong 2 Edge Functions. Nếu hostel mở rộng phòng, tất cả báo cáo occupancy sẽ sai. Nên đọc từ `SELECT COUNT(*) FROM rooms WHERE is_active = true`.

6. **[Cần xác nhận từ Lead Dev]** NT#3.1 — `balance_due` và group `grandTotal` tính ở frontend. Nếu `groups` table không có `grand_total` column, cần quyết định: thêm trigger-computed column ở DB hay chấp nhận frontend aggregation.

7. **[Cần xác nhận từ Lead Dev]** NT#3.3 — Role check ở `BottomNav` và `RoomManagementPanel`. Xác nhận đây có phải exception mới (Settings chỉ owner mới được sửa) hay vi phạm nguyên tắc "không phân quyền chi tiết".

8. **[Cần xác nhận từ Lead Dev]** NT#3.2 — `rooms` direct insert/update. Xác nhận `rooms` có cần đi qua RPC không (không có complex triggers như bookings).

9. **[Thấp - cleanup]** Xóa `src/shared/utils/parseCheckinExcel.ts` (313 dòng không dùng) sau khi xác nhận không có consumer ẩn.

10. **[Thấp - cleanup]** Remove 5 `console.log` debug calls trong `parseCheckinExcel.ts` (không có `DEV` guard).

---

*Audit thực hiện bởi Claude Code — read-only, không sửa code, không tạo commit.*
