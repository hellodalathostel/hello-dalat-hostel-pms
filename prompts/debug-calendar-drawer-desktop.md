# BUG: BookingDetailDrawer không mở khi nhấp phòng trên Calendar — CHỈ DESKTOP

## Triệu chứng
- Nhấp vào 1 booking/phòng trên Calendar tab, bản **web desktop** → **hoàn toàn im lặng**, không có gì xảy ra (không nháy, không lỗi console mà user thấy được).
- Trên **điện thoại (mobile)** → hoạt động bình thường, Drawer mở đúng.
- Không rõ mốc thời gian bắt đầu hỏng (đã lâu chưa test lại trên desktop).

## Nhiệm vụ: CHỈ ĐIỀU TRA + BÁO CÁO, CHƯA SỬA CODE

Không tự sửa code ở bước này. Tìm nguyên nhân, báo cáo lại rõ ràng (file, dòng, đoạn code liên quan) để Claude.ai (Lead Developer) review và ra hướng fix trước khi implement.

## Bước điều tra (theo thứ tự)

### 1. Tìm component Calendar và Drawer
```bash
grep -rn "BookingDetailDrawer" src/ --include="*.tsx" --include="*.ts"
grep -rln "Calendar" src/ --include="*.tsx" | grep -iv "test"
```
Xác định: có phải desktop và mobile dùng **2 component Calendar khác nhau** không (ví dụ `CalendarDesktop.tsx` vs `CalendarMobile.tsx`, hoặc 1 component chung với nhánh `if (isMobile)`).

### 2. Tìm nơi trigger mở Drawer (onClick / eventClick)
```bash
grep -rn "setDrawerOpen\|setSelectedBooking\|onEventClick\|onClick.*booking\|handleEventClick" src/ --include="*.tsx"
```
Kiểm tra:
- Handler này có được gắn vào phần tử render ra ở **desktop viewport** không, hay chỉ gắn ở nhánh mobile?
- Có điều kiện `isMobile` / `useBreakpoint()` / `screens.md` / `window.innerWidth` nào đang **gate ngược** (chỉ chạy khi mobile, quên nhánh desktop) không?

### 3. Kiểm tra breakpoint hook nếu có
```bash
grep -rn "useBreakpoint\|Grid.useBreakpoint\|matchMedia" src/ --include="*.tsx" --include="*.ts"
```
Nếu dùng Ant Design `Grid.useBreakpoint()` — kiểm tra logic có đảo `md`/`lg` sai không (bug quen thuộc: coi nhầm `!screens.md` là desktop).

### 4. Kiểm tra props truyền vào Drawer
```bash
grep -n "open=\|visible=" src/**/BookingDetailDrawer.tsx 2>/dev/null
```
Xem prop `open`/`visible` của `<Drawer>` (Ant Design) có bị bind vào 1 state khác desktop/mobile không, hoặc có điều kiện phụ nào chặn nó luôn `false` trên desktop.

### 5. Kiểm tra xem 2 view có dùng chung 1 instance Drawer hay tạo 2 Drawer riêng
- Nếu tạo 2 Drawer riêng (1 cho mobile, 1 cho desktop) → khả năng cao Drawer desktop **chưa từng được render** trong JSX tree ở nhánh desktop, hoặc bị comment/xoá sót sau lần refactor nào đó.
- Nếu dùng chung 1 Drawer → xem điều kiện render Drawer có bọc trong `{isMobile && <Drawer .../>}` sai chỗ không.

### 6. Kiểm tra z-index / CSS override có che khuất element clickable trên desktop
```bash
grep -rn "pointer-events\|z-index" src/ --include="*.css" --include="*.tsx" | grep -i calendar
```
(Ít khả năng hơn nhưng vẫn nên loại trừ — nếu overlay nào đó che phần click desktop dù handler đúng.)

## Output cần trả về cho Claude.ai

Không sửa code. Trả lời theo format:

```
CHẨN ĐOÁN: [1-2 câu mô tả nguyên nhân gốc]

Bằng chứng:
- File: [đường dẫn]
- Dòng: [số dòng]
- Đoạn code liên quan:
[paste đoạn code, không rút gọn]

Nghi vấn khác đã loại trừ: [nếu có, liệt kê ngắn]
```

Nếu tìm ra nhiều nghi vấn cùng lúc, liệt kê tất cả kèm mức độ tin cậy (cao/trung bình/thấp), không tự chọn 1 cái rồi bỏ qua cái khác.
