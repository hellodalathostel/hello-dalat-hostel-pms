# TASK: Full Repo Audit — Hello Dalat PMS (READ-ONLY, KHÔNG SỬA CODE)

## Vai trò
Bạn là code auditor, không phải code writer trong task này. Nhiệm vụ DUY NHẤT
là quét toàn bộ repo và xuất ra 1 báo cáo `.md`. KHÔNG sửa bất kỳ file nào.
KHÔNG tạo branch, KHÔNG commit. Nếu phát hiện vấn đề cần sửa, chỉ ghi vào báo
cáo — Claude (Lead Developer) sẽ quyết định ưu tiên và viết chỉ dẫn sửa sau.

## Bối cảnh dự án (để đánh giá đúng mức độ nghiêm trọng)
- Hostel 1 cơ sở, 8 phòng, 2 users (Owner + Staff). KHÔNG cần audit theo chuẩn
  enterprise/multi-tenant scale.
- Stack: React 18 + TS + Vite + Ant Design 5 + Zustand + TanStack Query v5 +
  RHF + Zod + Supabase (Postgres + RLS + Edge Functions/Deno).
- Cấu trúc hiện tại: feature-based colocation trong `src/features/*`. Đây là
  cấu trúc ĐÃ ĐƯỢC CHỌN CHỦ Ý — không đề xuất đổi sang cấu trúc khác
  (vd: atomic design, MVC layers...). Chỉ đánh giá vấn đề BÊN TRONG cấu trúc
  hiện có.
- Quy ước đã có (KHÔNG báo là vấn đề): code cũ giữ legacy path
  (`src/api/`, `src/app/`, `src/shared/`), code mới dùng v3 path
  (`src/lib/`, `src/router/`, `src/hooks/`, `src/utils/`, `src/components/`).
  Việc 2 path tồn tại song song là CHỦ Ý, không phải lỗi.

## Phạm vi quét
Toàn bộ `src/`, `supabase/migrations/`, `supabase/functions/`. Bỏ qua
`node_modules`, `dist`, `.git`.

---

## NHÓM 1 — Dead code / Legacy / Orphan
Tìm và list:
1. File/function/component không còn được import ở đâu (orphan) — verify bằng
   grep toàn repo cho tên export, không chỉ đoán.
2. Field/column legacy còn dùng tên cũ sau khi DB đã rename (vd: `price` thay
   vì `price_per_night` — đã biết có ở `dashboard.ts`, tìm thêm chỗ khác).
3. Feature flag hoặc UI đã ẩn (`hidden`, `disabled`, comment "tạm ẩn") nhưng
   code phía sau vẫn còn nguyên — báo rõ feature đó là gì.
4. Import không dùng, biến khai báo nhưng không dùng (unused vars/imports) —
   chỉ list nếu ESLint/tsc đã báo, không tự suy đoán.
5. Duplicate logic — cùng 1 việc (tính giá, format ngày, validate...) được
   viết lại ở >=2 nơi khác nhau thay vì dùng chung 1 hàm.

## NHÓM 2 — File quá dài / phức tạp cần tách
1. List file `.tsx`/`.ts` trong `src/` có >300 dòng, sắp xếp giảm dần theo
   số dòng. Ghi rõ số dòng thực tế.
2. Với mỗi file >300 dòng: 1 câu mô tả file đang làm bao nhiêu việc khác
   nhau (vd: "vừa fetch data, vừa render UI, vừa validate form, vừa format
   export Excel — 4 trách nhiệm").
3. Component nào có >5 useState/useEffect riêng lẻ mà có thể gộp thành 1
   custom hook.
4. Hook nào gọi >3 RPC/query khác nhau mà không có lý do rõ ràng (có thể tách
   thành nhiều hook nhỏ theo từng RPC).
KHÔNG đề xuất tách nếu file dài nhưng đơn giản (vd: file toàn JSX lặp lại,
hoặc file chứa nhiều type definition — đó không phải vấn đề).

## NHÓM 3 — Lỗi tiềm ẩn theo 7 nguyên tắc cốt lõi của dự án
Với MỖI nguyên tắc, list file/dòng vi phạm cụ thể (không chung chung):

1. **DB là source of truth** — tìm chỗ frontend tự tính lại `grand_total`,
   `room_subtotal`, `nights`, `net_revenue` thay vì đọc từ DB.
2. **Mutation transactional** — tìm chỗ gọi `.insert()`/`.update()`/`.delete()`
   trực tiếp từ Supabase client (frontend) vào bảng nghiệp vụ
   (`bookings`, `payments`, `booking_services`, `booking_discounts`,
   `groups`, `customers`, `expenses`...) thay vì gọi RPC `_txn`.
3. **RLS / phân quyền** — tìm chỗ code FE tự thêm role-check
   (vd: `if (role === 'owner')`) để ẩn/khoá chức năng KHÔNG thuộc 2 ngoại lệ
   đã xác nhận (`app_users`, `void_checkedout_booking_txn`). Đây là vi phạm
   nguyên tắc "Owner và Staff đều full CRUD, không phân quyền chi tiết".
4. **Edge Functions chỉ I/O** — tìm Edge Function có business logic tính
   toán (không chỉ gọi RPC rồi trả kết quả).
5. **Migration qua file SQL** — không áp dụng được qua audit code, BỎ QUA mục
   này (đã biết vấn đề ở Known Issue #4, không cần quét lại).
6. **PII không log/cache** — tìm `console.log`, `localStorage`, URL
   params/query string có chứa CCCD, passport, số CMND, hoặc field tên tương
   tự (`cccd`, `passport_number`, `id_number`).
7. **Try/catch + toast cho mọi mutation** — tìm mutation (`useMutation`,
   hàm gọi RPC) KHÔNG có try/catch hoặc không gọi `useAppFeedback` khi lỗi.
   Lưu ý: toast PHẢI qua `useAppFeedback` (`App.useApp()`) — nếu thấy import
   `message` từ `antd` trực tiếp, đó cũng là vi phạm, list riêng.

---

## Format output bắt buộc
Tạo file `AUDIT_REPORT.md` ở root repo (không commit, chỉ để Hiếu đọc), theo
đúng cấu trúc bảng sau — không viết văn xuôi dài dòng:

```markdown
# Audit Report — [ngày giờ chạy]

## Tóm tắt
- Tổng số file quét: X
- Nhóm 1 (dead code): X vấn đề
- Nhóm 2 (file cần tách): X file
- Nhóm 3 (vi phạm nguyên tắc): X vấn đề, chia theo nguyên tắc nào nhiều nhất

## Nhóm 1 — Dead code / Legacy
| File | Loại vấn đề | Mô tả ngắn | Mức độ (Cao/Trung/Thấp) |
|------|------------|-----------|--------------------------|

## Nhóm 2 — File cần tách
| File | Số dòng | Số trách nhiệm | Đề xuất tách thành |
|------|---------|-----------------|---------------------|

## Nhóm 3 — Vi phạm nguyên tắc
| Nguyên tắc # | File:Dòng | Mô tả vi phạm | Mức độ |
|--------------|-----------|----------------|--------|

## Đề xuất thứ tự xử lý
(Chỉ sắp xếp theo mức độ rủi ro, KHÔNG viết code sửa — để Claude Lead Dev
quyết định)
1. ...
2. ...
```

## Ràng buộc
- Mỗi dòng trong bảng phải có file path + (số dòng nếu áp dụng) — không ghi
  mơ hồ kiểu "một số file trong features/bookings".
- Không tự sửa, không tạo PR, không format lại code khi quét.
- Nếu không chắc 1 trường hợp có phải vi phạm hay không, ghi vào cột "Mức độ"
  là "Cần xác nhận" thay vì bỏ qua hoặc tự quyết.
- Giới hạn thời gian hợp lý — nếu repo quá lớn để quét hết 1 lần, ưu tiên quét
  `src/features/*` và `supabase/functions/*` trước, báo rõ phần nào chưa kịp
  quét.