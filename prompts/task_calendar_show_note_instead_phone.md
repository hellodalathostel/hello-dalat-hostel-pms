# Task: Calendar hiển thị Ghi chú booking thay vì SĐT khách

## Bối cảnh
Tab Calendar (`RoomCalendarPage.tsx` → `CalendarTimeline.tsx`) hiện đang hiển thị **SĐT khách** ở:
1. Tooltip khi hover vào block booking
2. Label nhỏ dưới tên khách trên thanh block

Yêu cầu: đổi thành **ghi chú booking** (`bookings.note`), giữ tên khách như cũ.

## Trạng thái DB (đã làm xong — KHÔNG cần đụng vào)
Đã chạy migration `add_booking_note_to_room_calendar_view` trên Supabase project
`rcfhhgywjdwqcgnpkbtl`. View `public.room_calendar` đã có thêm cột `booking_note`
(lấy từ `bookings.note`, NULL cho block/ota_block). Đã verify bằng SELECT — hoạt động đúng.

**Việc còn lại chỉ là frontend — 3 file, sửa surgical, không đổi logic khác.**

---

## File 1: `src/types/calendar.ts`

Thêm field `booking_note` vào interface `CalendarEvent`, ngay sau `guest_phone`:

```typescript
export interface CalendarEvent {
  room_id: string
  room_name: string | null
  date: string
  booking_id: string | null
  code: string | null
  block_id: string | null
  entry_type: 'booking' | 'block' | null
  group_id: string | null
  status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled' | null
  is_blocked: boolean
  guest_name: string | null
  guest_phone: string | null
  booking_note: string | null   // ← THÊM MỚI: bookings.note, hiển thị thay SĐT trên Calendar
  check_in: string | null
  check_out: string | null
  checkin_at: string | null
  checkout_at: string | null
  grand_total: number | null
  block_reason: string | null
}
```

**Không xóa `guest_phone`** — vẫn giữ trong type, chỉ không dùng ở UI Calendar nữa. Data vẫn có sẵn nếu cần dùng lại sau.

---

## File 2: `src/features/calendar/hooks/useRoomCalendar.ts`

### 2a. Interface `RoomCalendarRawRecord` — thêm field raw từ view

Tìm interface này (có `customer_phone?: string | null`), thêm ngay dưới:

```typescript
interface RoomCalendarRawRecord {
  room_id: number | string
  room_name?: string | null
  date?: string | null
  check_in?: string | null
  check_out?: string | null
  start_date?: string | null
  end_date?: string | null
  booking_id?: string | null
  code?: string | null
  block_id?: string | null
  entry_type?: 'booking' | 'block' | null
  group_id?: string | null
  booking_status?: 'booked' | 'checked-in' | 'checked-out' | 'cancelled' | null
  is_blocked?: boolean | null
  guest_name?: string | null
  customer_phone?: string | null
  booking_note?: string | null   // ← THÊM MỚI
  checkin_at?: string | null
  checkout_at?: string | null
  grand_total?: number | null
  block_reason?: string | null
}
```

### 2b. Hàm `expandRangeRecordToDailyEvents`

Tìm đoạn return object (có `guest_phone: record.customer_phone ?? null,`), thêm dòng ngay dưới:

```typescript
      guest_name: record.guest_name ?? null,
      guest_phone: record.customer_phone ?? null,
      booking_note: record.booking_note ?? null,   // ← THÊM MỚI
      check_in: record.check_in ?? record.start_date ?? null,
```

### 2c. Hàm `normalizeCalendarRecords`

Tìm đoạn push object trong nhánh `if (record.date)` (có `guest_phone: record.customer_phone ?? null,`), thêm dòng ngay dưới:

```typescript
        guest_name: record.guest_name ?? null,
        guest_phone: record.customer_phone ?? null,
        booking_note: record.booking_note ?? null,   // ← THÊM MỚI
        check_in: record.check_in ?? record.start_date ?? null,
```

**Lưu ý:** có 2 chỗ tương tự nhau trong file này (1 ở `expandRangeRecordToDailyEvents`, 1 ở `normalizeCalendarRecords`) — cần sửa cả 2, đừng nhầm chỉ sửa 1 chỗ.

---

## File 3: `src/features/calendar/components/CalendarTimeline.tsx`

### 3a. Hàm `buildVacantEvent`

Thêm field để object khớp type `CalendarEvent` mới (nếu không thêm sẽ lỗi TS build):

```typescript
  const buildVacantEvent = (roomId: string, date: string): CalendarEvent => ({
    room_id: roomId,
    room_name: null,
    date,
    booking_id: null,
    code: null,
    block_id: null,
    entry_type: null,
    group_id: null,
    status: null,
    is_blocked: false,
    guest_name: null,
    guest_phone: null,
    booking_note: null,   // ← THÊM MỚI
    check_in: date,
    check_out: date,
    checkin_at: null,
    checkout_at: null,
    grand_total: null,
    block_reason: null,
  })
```

### 3b. Tooltip + label hiển thị trên block

Tìm đoạn JSX `<Tooltip title={...}>` chứa dòng `SĐT: {event.guest_phone ?? 'Chưa có'}` và dòng
`{event.guest_phone ?? 'Chưa có số điện thoại'}` ngay dưới trong `cal-block__meta`.

**Thay toàn bộ block này:**

```tsx
                      <Tooltip
                        title={
                          <div>
                            <div>{event.guest_name ?? 'Khách chưa xác định'}</div>
                            <div>Mã: {event.code ?? '—'}</div>
                            <div>SĐT: {event.guest_phone ?? 'Chưa có'}</div>
                            <div>Check-in: {formatEventTime(event.checkin_at)}</div>
                            <div>Check-out: {formatEventTime(event.checkout_at)}</div>
                          </div>
                        }
                      >
                        <div className="cal-block__content">
                          <span className="cal-block__title">{shortLabel}</span>
                          <Typography.Text className="cal-block__meta">
                            {event.guest_phone ?? 'Chưa có số điện thoại'}
                          </Typography.Text>
                        </div>
                      </Tooltip>
```

**Thành:**

```tsx
                      <Tooltip
                        title={
                          <div>
                            <div>{event.guest_name ?? 'Khách chưa xác định'}</div>
                            <div>Mã: {event.code ?? '—'}</div>
                            <div>Ghi chú: {event.booking_note || 'Không có'}</div>
                            <div>Check-in: {formatEventTime(event.checkin_at)}</div>
                            <div>Check-out: {formatEventTime(event.checkout_at)}</div>
                          </div>
                        }
                      >
                        <div className="cal-block__content">
                          <span className="cal-block__title">{shortLabel}</span>
                          <Typography.Text className="cal-block__meta">
                            {event.booking_note || 'Không có ghi chú'}
                          </Typography.Text>
                        </div>
                      </Tooltip>
```

Lưu ý: dùng `||` (không phải `??`) vì cần fallback cả khi `booking_note` là chuỗi rỗng `''` (nhiều booking cũ có `note = ''` thay vì `null`, đã thấy trong data thật khi verify DB).

---

## Sau khi sửa xong

1. Chạy `tsc -b --noEmit` để confirm không có type error (vì đã thêm field bắt buộc vào `CalendarEvent`, mọi nơi tạo object kiểu này phải có field `booking_note`).
2. Chạy `eslint` theo chuẩn repo.
3. KHÔNG cần sửa gì ở `BookingDetailDrawer.tsx` — SĐT vẫn hiển thị đúng ở đó như cũ, chỉ đổi ở Calendar.
4. Test thủ công: mở tab Calendar, hover vào 1 booking có ghi chú (ví dụ khách "Nikita Abramov" phòng 101 có sẵn note "Approximate time of arrival: between 13:00 and 14:00" trong DB thật) → phải thấy "Ghi chú: ..." thay vì SĐT.
5. Test booking không có note → phải thấy "Không có ghi chú" / "Không có" (không bị trống hoặc lỗi).

## Commit convention
```
refactor(calendar): show booking note instead of guest phone on timeline
```