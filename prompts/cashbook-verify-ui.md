# Task: Chạy dev server và verify UI module Sổ quỹ

Module Sổ quỹ (`/so-quy`) vừa implement xong, `tsc -b` đã sạch. Giờ cần verify UI chạy thật.

## Bước 1 — Khởi động

```bash
npm run dev
```

Mở `http://localhost:5173/so-quy` (hoặc port Vite báo).

Nếu trang trắng hoặc lỗi runtime, **dừng lại và báo cáo lỗi console trước khi làm tiếp**.

## Dữ liệu DB hiện tại (production, ngày 2026-07-21)

| | |
|---|---|
| Tồn đầu ngày | 3.726.350 ₫ |
| Thu trong ngày | 1.684.410 ₫ (3 giao dịch tự động) |
| Chi trong ngày | 50.000 ₫ (1 giao dịch nhập tay) |
| **Tồn quỹ** | **5.360.760 ₫** |
| Trạng thái | Chưa chốt ca |

4 dòng giao dịch:

| Giờ | Nội dung | Loại | Số tiền |
|---|---|---|---|
| 08:52 | Thu khach - RUM CHAU | Tự động | +169.650 |
| 11:03 | Thu khach - Sarah Crean Ireland | Tự động | +617.760 |
| 11:12 | Thu khach - Pedro Estrada | Tự động | +897.000 |
| 11:15 | Mua nuoc rua chen | **Nhập tay** | −50.000 |

> ⚠️ **Đây là production DB.** Giao dịch mới có thể phát sinh bất cứ lúc nào (Lợi đang thu tiền khách). Nếu số không khớp bảng trên, kiểm tra lại danh sách chi tiết trước khi kết luận là bug — rất có thể chỉ là dữ liệu mới.

## Bước 2 — Verify hiển thị (mobile 375px)

Mở DevTools, chọn viewport iPhone SE (375×667).

- [ ] Tồn quỹ hiển thị **5.360.760 ₫** (định dạng dấu chấm ngăn cách nghìn)
- [ ] Thu **1.684.410 ₫** màu xanh, Chi **50.000 ₫** màu đỏ
- [ ] 4 dòng giao dịch, sắp xếp theo giờ tăng dần
- [ ] 3 dòng "Thu khach" có tag **Tự động** (màu xanh, icon robot), **KHÔNG** có nút ba chấm
- [ ] Dòng "Mua nuoc rua chen" có tag **Nhập tay** + nút ba chấm bên phải
- [ ] Không có phần tử nào tràn ngang, không phải scroll ngang
- [ ] Nút "Thêm giao dịch" và "Chốt ca" đủ lớn để bấm bằng ngón tay (≥44px chiều cao)

## Bước 3 — Test luồng THÊM

1. Bấm "Thêm giao dịch"
2. Verify: modal không tràn viewport 375px
3. Chọn loại "Chi vặt" → phải hiện alert vàng **"Tiền RA khỏi két"**
4. Chọn loại "Chủ góp tiền" → alert đổi thành xanh **"Tiền VÀO két"**
5. Nhập số tiền `30000` → verify hiển thị thành `30.000` khi gõ
6. Nhập nội dung "Test them giao dich", bấm "Ghi sổ"
7. Verify: toast xanh, modal đóng, tồn quỹ **tăng** 30.000 → 5.390.760
8. Dòng mới xuất hiện trong danh sách với tag Nhập tay

## Bước 4 — Test luồng SỬA

1. Bấm ba chấm ở dòng "Test them giao dich" → chọn "Sửa"
2. Verify: form đã điền sẵn đúng loại/số tiền/nội dung
3. Đổi số tiền thành `45000`, lưu
4. Verify: tồn quỹ tăng thêm 15.000 → 5.405.760

## Bước 5 — Test luồng HUỶ

1. Bấm ba chấm ở dòng vừa sửa → "Huỷ giao dịch"
2. Verify: modal hiện đúng nội dung + số tiền của giao dịch
3. Bấm OK khi **để trống lý do** → phải báo lỗi "Bắt buộc ghi lý do huỷ"
4. Nhập lý do "Test xong", bấm "Huỷ giao dịch"
5. Verify: dòng biến mất khỏi danh sách, tồn quỹ về 5.360.760

## Bước 6 — Test CHỐT CA (có chênh lệch)

1. **Đọc lại tồn quỹ hiển thị trên màn hình** (có thể đã đổi nếu Lợi vừa thu tiền)
2. Bấm "Chốt ca"
3. Nhập số đếm được = **tồn quỹ hiện tại trừ đi 6.000** (giả lập thiếu tiền)
4. Verify: cột bên phải hiện "Thiếu 6.000 ₫" màu đỏ **ngay khi gõ**, trước khi submit
5. Label ô ghi chú đổi thành "Lý do chênh lệch (nên ghi)"
6. Nhập lý do, bấm "Chốt ca"
7. Verify sau khi chốt:
   - Tag xám **"Đã chốt ca"** + tag đỏ **"Thiếu 6.000₫"**
   - Nút "Thêm giao dịch" và "Chốt ca" **biến mất**
   - Chỉ còn nút **"Mở lại ca"**
   - Nút ba chấm trên mọi dòng **biến mất**

## Bước 7 — Test MỞ LẠI CA

1. Bấm "Mở lại ca"
2. Bấm OK khi để trống lý do → phải báo lỗi
3. Nhập lý do "Dem lai", bấm "Mở lại ca"
4. Verify: tag "Đã chốt ca" biến mất, nút Thêm/Chốt quay lại, nút ba chấm quay lại

## Bước 8 — Test CHỐT CA (khớp)

1. Bấm "Chốt ca", nhập **đúng** tồn quỹ hiển thị
2. Verify: cột phải hiện "Khớp 0 ₫" màu xanh
3. Chốt → tag "Đã chốt ca", **không** có tag thiếu/thừa

## Bước 9 — Test chọn ngày khác

1. Chọn ngày 20/07/2026 trên DatePicker
2. Verify: hiển thị "Chưa có giao dịch" (ngày trước khai sổ, không có dữ liệu)
3. Không crash

## Bước 10 — Dọn dẹp

Sau khi test xong, **mở lại ca ngày 21/07** để Hiếu tự chốt vào cuối ngày thật.

Ngoài ra, giao dịch "Mua nuoc rua chen" 50.000 là dữ liệu test do Hiếu tạo — **hỏi Hiếu trước** xem có huỷ không, đừng tự ý huỷ.

## Báo cáo

Sau khi chạy xong, báo cáo theo dạng:

- ✅ Bước nào pass
- ❌ Bước nào fail — kèm screenshot hoặc mô tả cụ thể + lỗi console nếu có
- ⚠️ Điều gì hoạt động nhưng trải nghiệm chưa tốt (nút quá nhỏ, chữ tràn, animation giật...)

Nếu phát hiện bug, **đừng tự sửa ngay** — báo cáo trước để Hiếu quyết định, vì có thể là vấn đề thiết kế chứ không phải lỗi code.

## Lưu ý an toàn

- Đây là **production DB**, không phải môi trường test. Mọi giao dịch tạo ra là thật.
- Chỉ tạo/sửa/huỷ các giao dịch có nội dung bắt đầu bằng "Test" — **không đụng vào giao dịch "Thu khach"** của khách thật.
- Nếu lỡ tay chốt ca sai, dùng "Mở lại ca" để khôi phục — không cần chạy SQL.
