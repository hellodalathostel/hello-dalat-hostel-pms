diff --git a/src/features/calendar/components/CalendarTimeline.tsx b/src/features/calendar/components/CalendarTimeline.tsx
index d2e08df..351f356 100644
--- a/src/features/calendar/components/CalendarTimeline.tsx
+++ b/src/features/calendar/components/CalendarTimeline.tsx
@@ -76,8 +76,6 @@ function useDragScroll() {
       startTime: performance.now(),
       scrollLeft: element.scrollLeft,
     }
-
-    element.setPointerCapture(event.pointerId)
   }, [])
 
   const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
@@ -103,6 +101,13 @@ function useDragScroll() {
       dragState.current.moved = true
       setIsDragging(true)
       element.classList.add('calendar-table-wrapper--dragging')
+      // Chỉ capture khi đã thật sự kéo — capture ngay từ pointerdown khiến
+      // click chuột bị retarget về wrapper, .cal-block / ô trống không nhận onClick.
+      try {
+        element.setPointerCapture(event.pointerId)
+      } catch {
+        // pointer có thể đã kết thúc trước khi kịp capture
+      }
     }
 
     if (dragState.current.moved) {
@@ -117,7 +122,11 @@ function useDragScroll() {
     element?.classList.remove('calendar-table-wrapper--dragging')
 
     if (element?.hasPointerCapture(event.pointerId)) {
-      element.releasePointerCapture(event.pointerId)
+      try {
+        element.releasePointerCapture(event.pointerId)
+      } catch {
+        // pointer có thể đã bị release
+      }
     }
 
     requestAnimationFrame(() => setIsDragging(false))
diff --git a/src/features/calendar/hooks/useRoomCalendar.ts b/src/features/calendar/hooks/useRoomCalendar.ts
index 6026727..2c3a0fc 100644
--- a/src/features/calendar/hooks/useRoomCalendar.ts
+++ b/src/features/calendar/hooks/useRoomCalendar.ts
@@ -37,7 +37,7 @@ interface RoomCalendarRawRecord {
   booking_id?: string | null
   code?: string | null
   block_id?: string | null
-  entry_type?: 'booking' | 'block' | null
+  entry_type?: 'booking' | 'block' | 'ota_block' | null
   group_id?: string | null
   booking_status?: 'booked' | 'checked-in' | 'checked-out' | 'cancelled' | null
   is_blocked?: boolean | null
diff --git a/src/features/calendar/pages/RoomCalendarPage.tsx b/src/features/calendar/pages/RoomCalendarPage.tsx
index c75338e..095804e 100644
--- a/src/features/calendar/pages/RoomCalendarPage.tsx
+++ b/src/features/calendar/pages/RoomCalendarPage.tsx
@@ -30,7 +30,7 @@ function formatDate(date: string | null): string {
 export default function RoomCalendar(): React.JSX.Element {
   const [manager, contextHolder] = Modal.useModal()
   const queryClient = useQueryClient()
-  const { notification } = useAppFeedback()
+  const { message, notification } = useAppFeedback()
   const deleteBlockMutation = useDeleteBlock()
   const [range, setRange] = useState<DateRangeValue>(defaultRange)
   const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
@@ -46,6 +46,12 @@ export default function RoomCalendar(): React.JSX.Element {
   const { data, isLoading, isFetching, error } = useRoomCalendar({ startDate, endDate, rooms })
 
   const handleBookingClick = (event: CalendarEvent) => {
+    // Block OTA (ota_calendar_feed) chỉ đồng bộ từ iCal — không mở block / không tạo block mới
+    if (event.entry_type === 'ota_block') {
+      message.info('Block từ OTA, được đồng bộ tự động từ iCal')
+      return
+    }
+
     if (event.entry_type === 'block' && event.block_id) {
       manager.confirm({
         title: `Mi block phong ${event.room_id}?`,
diff --git a/src/types/calendar.ts b/src/types/calendar.ts
index 60a92e6..f59540b 100644
--- a/src/types/calendar.ts
+++ b/src/types/calendar.ts
@@ -8,7 +8,7 @@ export interface CalendarEvent {
   booking_id: string | null
   code: string | null
   block_id: string | null
-  entry_type: 'booking' | 'block' | null
+  entry_type: 'booking' | 'block' | 'ota_block' | null
   group_id: string | null
   status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled' | null
   is_blocked: boolean
