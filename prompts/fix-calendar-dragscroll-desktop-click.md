# FIX: Drag-to-scroll trong CalendarTimeline nuốt mất click chuột trên desktop

## Bối cảnh
Đã xác nhận nguyên nhân: `useDragScroll()` trong
`src/features/calendar/components/CalendarTimeline.tsx` set `isDragging = true`
chỉ dựa trên khoảng cách di chuyển (`DRAG_THRESHOLD = 5` px), không có time-based
guard. Một click chuột bình thường trên desktop thường rung vài pixel giữa
`pointerdown` và `pointerup` → dễ dàng vượt ngưỡng 5px → `isDragging = true` →
mọi `onClick` (booking-block, ô trống, nút new-booking) bị chặn im lặng.
Trên mobile, tap không phát sinh đủ `pointermove` để vượt ngưỡng nên không bị.

## Yêu cầu: SỬA ĐÚNG 1 HÀM, KHÔNG ĐỘNG GÌ KHÁC

Chỉ sửa `useDragScroll()` (dòng 42–106 trong
`src/features/calendar/components/CalendarTimeline.tsx`). KHÔNG sửa các
`onClick` handler ở dòng 144–150, 204, 211–219, 249–253, 270–274 — chúng đã
đúng logic, chỉ cần `isDragging` được tính chính xác hơn.

## Thay đổi cụ thể

Thêm time-based guard: chỉ coi là "đang kéo" nếu đã vượt `DRAG_THRESHOLD`
khoảng cách **VÀ** đã trôi qua tối thiểu `DRAG_TIME_THRESHOLD_MS` kể từ lúc
`pointerdown`. Đồng thời tăng `DRAG_THRESHOLD` từ 5 lên 8 làm lớp bảo vệ thứ hai.

Thay thế toàn bộ hàm `useDragScroll` (dòng 42–106) bằng:

```tsx
function useDragScroll() {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef({
    active: false,
    moved: false,
    startX: 0,
    startTime: 0,
    scrollLeft: 0,
  })
  const [isDragging, setIsDragging] = useState(false)

  const DRAG_THRESHOLD = 8
  const DRAG_TIME_THRESHOLD_MS = 100

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const element = wrapperRef.current
    if (!element) {
      return
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    dragState.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startTime: performance.now(),
      scrollLeft: element.scrollLeft,
    }

    element.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) {
      return
    }

    const element = wrapperRef.current
    if (!element) {
      return
    }

    const deltaX = event.clientX - dragState.current.startX
    const elapsed = performance.now() - dragState.current.startTime

    // Chỉ coi là kéo khi vượt cả ngưỡng khoảng cách LẪN ngưỡng thời gian —
    // click chuột thật luôn rất nhanh (<100ms), kéo cố ý để cuộn luôn chậm hơn.
    if (
      !dragState.current.moved &&
      Math.abs(deltaX) > DRAG_THRESHOLD &&
      elapsed > DRAG_TIME_THRESHOLD_MS
    ) {
      dragState.current.moved = true
      setIsDragging(true)
      element.classList.add('calendar-table-wrapper--dragging')
    }

    if (dragState.current.moved) {
      element.scrollLeft = dragState.current.scrollLeft - deltaX
    }
  }, [])

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const element = wrapperRef.current
    dragState.current.active = false
    dragState.current.moved = false
    element?.classList.remove('calendar-table-wrapper--dragging')

    if (element?.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId)
    }

    requestAnimationFrame(() => setIsDragging(false))
  }, [])

  return { wrapperRef, isDragging, onPointerDown, onPointerMove, onPointerUp }
}
```

## Lưu ý khi implement
- Chỉ thay `dragState.current` khởi tạo (dòng 44) và bên trong `onPointerDown`
  (dòng 59–64) để thêm field `startTime`; và sửa điều kiện trong `onPointerMove`
  (dòng 81) để thêm check `elapsed`.
- `onPointerUp` (dòng 92–103) giữ nguyên, không cần sửa.
- Không tự ý đổi `DRAG_TIME_THRESHOLD_MS` khác 100 hoặc `DRAG_THRESHOLD` khác 8
  nếu không có lý do — đây là giá trị đã cân nhắc, không phải placeholder.

## Test thủ công sau khi sửa (Hiếu tự test, không cần automated test)
1. Desktop: click nhanh vào 1 booking-block trên Calendar → Drawer phải mở.
2. Desktop: click nhanh vào 1 ô trống → phải điều hướng sang new-booking hoặc
   mở Drawer tạo booking (tuỳ handler hiện tại).
3. Desktop: giữ chuột và kéo ngang thật (kéo > 100ms, di chuyển > 8px) →
   calendar vẫn phải cuộn ngang bình thường, không mở Drawer nhầm.
4. Mobile: tap vào booking-block → Drawer vẫn phải mở bình thường như trước
   (không được regress).

## Không cần migration / RLS / Edge Function
Đây là thay đổi frontend thuần (event handling logic), không chạm DB.
