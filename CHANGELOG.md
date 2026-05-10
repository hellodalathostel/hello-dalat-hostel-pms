# Changelog

Tài liệu này ghi lại tiến trình phát triển, cấu trúc hiện tại và quy trình build của dự án Hello Dalat Hostel PMS.

## [0.1.0] - 2026-05-10

### Tổng quan kiến trúc hiện tại
- Frontend: React 18 + TypeScript + Vite.
- UI: Ant Design 5.
- State:
  - Client auth/state cục bộ: Zustand.
  - Server state: TanStack Query v5.
- Form + validation: React Hook Form + Zod.
- Date/time: dayjs.
- Data backend: Supabase (PostgreSQL + RPC + Edge Functions).

### Cấu trúc dự án (đã hình thành)
- src/app
  - Router, layout và providers toàn ứng dụng.
- src/pages
  - Các màn hình nghiệp vụ chính: Dashboard, NewBooking, RoomCalendar, RevenueDashboard, DK14Report, CheckinImportPage, Login, Settings.
- src/components
  - Bộ component theo nghiệp vụ: checkin, checkout, payment, dashboard, calendar, booking.
- src/hooks
  - Hooks dữ liệu và mutation cho các luồng nghiệp vụ vận hành.
- src/api
  - Tầng gọi Supabase/RPC (check-in/check-out/payment/booking).
- src/lib và src/types
  - Schemas, types và hợp đồng dữ liệu dùng chung.
- src/shared
  - Constants, helper hooks và utility chuẩn hóa lỗi/feedback.
- supabase/functions
  - Edge Functions cho tác vụ nền (nhắc nhở, tổng hợp doanh thu, iCal feed, xử lý check-in).
- supabase/migrations
  - Migration schema SQL theo từng mốc.

### Tiến trình build sản phẩm đến hiện tại
- Giai đoạn 1: Nền tảng SPA
  - Khởi tạo Vite + React + TypeScript strict.
  - Thiết lập alias @ -> src để đồng nhất import.
  - Cấu hình ESLint cho TS + React hooks + Vite refresh.
- Giai đoạn 2: Khung nghiệp vụ cốt lõi
  - Dựng router có bảo vệ đăng nhập (AuthGuard + MainLayout).
  - Hoàn thiện các trang vận hành chính cho hostel PMS.
- Giai đoạn 3: Chuẩn hóa giao tiếp database qua RPC
  - Tạo booking theo giao dịch create_group_booking_txn.
  - Thanh toán theo giao dịch record_payment_txn.
  - Check-in/check-out qua các RPC transaction chuyên biệt.
  - Quy ước nghiệp vụ: hạn chế thao tác INSERT/UPDATE trực tiếp từ client.
- Giai đoạn 4: Báo cáo và tự động hóa vận hành
  - Lịch phòng hợp nhất booking + room blocks.
  - Dashboard doanh thu theo tháng/nguồn/phòng.
  - Báo cáo DK14 và xuất file mẫu khai báo lưu trú.
  - Luồng import check-in từ Excel.
  - Bổ sung Edge Functions cho nhắc việc và tổng hợp dữ liệu.
- Giai đoạn 5: Củng cố dữ liệu
  - Bổ sung migration unique cho định danh khách nhằm giảm trùng lặp hồ sơ.

### Quy trình build và chạy hiện tại
- Cài dependencies:
  - pnpm install
- Chạy local dev server:
  - pnpm dev
- Lint code:
  - pnpm lint
- Build production:
  - pnpm build
  - Pipeline build gồm:
    - tsc -b (project references: app + node config).
    - vite build (bundle frontend production).
- Xem bản build local:
  - pnpm preview

### Build profile kỹ thuật
- TypeScript
  - strict = true.
  - noUnusedLocals/noUnusedParameters bật để siết chất lượng.
  - noEmit trong tsconfig app/node; emit artifact do Vite đảm nhiệm.
- Vite
  - Plugin React.
  - Alias @ cho đường dẫn src.
- ESLint
  - @eslint/js + typescript-eslint + react-hooks + react-refresh.
  - Bỏ qua thư mục dist.

### Mốc database và migration đáng chú ý
- 20260510000100_add_guests_id_number_unique.sql
  - Thêm unique constraint cho id_number (bảng guests) để ngăn bản ghi trùng giấy tờ.

### Trạng thái tài liệu
- README hiện còn là template Vite mặc định.
- CHANGELOG này là bản chuẩn hóa đầu tiên cho dự án PMS.

---

## Định hướng cập nhật changelog các phiên bản tiếp theo
- Mỗi lần release dùng format:
  - [x.y.z] - YYYY-MM-DD
  - Added / Changed / Fixed / Removed / Database / Ops.
- Mọi thay đổi có ảnh hưởng dữ liệu phải nêu rõ:
  - RPC liên quan.
  - Migration liên quan.
  - Ảnh hưởng tương thích ngược (nếu có).
