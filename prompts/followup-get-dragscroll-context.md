# FOLLOW-UP: Cần thêm context trước khi Claude.ai ra fix chính thức

Chẩn đoán về `useDragScroll` trong `CalendarTimeline.tsx` đã được Claude.ai (Lead
Developer) chấp nhận là hướng đúng. Trước khi viết fix, cần xem thêm code để
không đoán sai cấu trúc state.

## Yêu cầu: CHỈ PASTE CODE, KHÔNG SỬA

Paste nguyên văn (không rút gọn, không tóm tắt) các đoạn sau từ
`src/features/calendar/components/CalendarTimeline.tsx`:

1. **Toàn bộ hook `useDragScroll`** — từ dòng đầu tiên khai báo hook (bao gồm
   `dragState` ref được khởi tạo thế nào, có field gì) cho tới hết, tức là
   khoảng dòng 1–110 (bao trùm luôn đoạn `onPointerMove` đã paste trước đó).
   Cụ thể cần thấy:
   - `onPointerDown` — cách `dragState.current` được set lúc bắt đầu
   - `onPointerUp` / `onPointerCancel` — cách `isDragging` được reset về `false`,
     và thời điểm reset (ngay lập tức hay có delay/setTimeout nào không)
   - Khai báo `DRAG_THRESHOLD` và bất kỳ constant liên quan khác (nếu có
     threshold thời gian nào đã tồn tại sẵn thì càng cần biết)

2. **Đoạn nơi hook này được gọi/attach vào element** — dòng nào gắn
   `onPointerDown={...}`, `onPointerMove={...}`, `onPointerUp={...}` vào JSX,
   để biết nó áp cho toàn bộ wrapper hay từng row/cell riêng.

3. Nếu `dragState` hoặc `isDragging` được dùng ở nơi nào khác trong file
   (ngoài đoạn `onClick`/`handleCellClick` đã thấy) → liệt kê luôn.

## Output

Chỉ trả lời bằng code block, có số dòng, không thêm bình luận/đề xuất fix.
Việc quyết định hướng sửa do Claude.ai làm ở bước sau.
