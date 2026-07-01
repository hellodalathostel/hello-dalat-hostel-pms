# Task: Calendar — Ẩn note khi rỗng + truncate 1 dòng (fix follow-up)

## Bối cảnh
Follow-up của task trước (`task_calendar_show_note_instead_phone.md` — đổi hiển thị Calendar
từ SĐT sang `booking_note`). Sau khi implement, phát sinh 2 lỗi thấy qua screenshot thực tế:

1. Khi không có note, đang hiện chữ "Không có ghi chú" — Hiếu muốn **ẩn hẳn**, không hiện gì.
2. Note dài (ví dụ "Meal: Breakfast included") bị wrap xuống 2-3 dòng vì `.cal-block__meta`
   chưa có truncate — làm block tràn nội dung, bị `overflow: hidden` của `.cal-block` cắt mất,
   gây hiện tượng chữ tên khách ở dòng/ô lân cận bị cắt cụt (ví dụ "Mai HDV", "Bích Vân").
   → Cần ép **1 dòng duy nhất**, dư thì ẩn bằng ellipsis (`...`), không cần hiển thị đầy đủ
   (đầy đủ đã có sẵn trong Tooltip khi hover).

**Không cần đụng DB/migration — chỉ sửa rendering frontend.**

---

## File 1: `src/features/calendar/components/CalendarTimeline.tsx`

Tìm khối JSX hiện tại (đã có từ lần implement trước, dùng `||`/`??` fallback text):

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

**Thay thành:**

```tsx
                      <Tooltip
                        title={
                          <div>
                            <div>{event.guest_name ?? 'Khách chưa xác định'}</div>
                            <div>Mã: {event.code ?? '—'}</div>
                            {event.booking_note && <div>Ghi chú: {event.booking_note}</div>}
                            <div>Check-in: {formatEventTime(event.checkin_at)}</div>
                            <div>Check-out: {formatEventTime(event.checkout_at)}</div>
                          </div>
                        }
                      >
                        <div className="cal-block__content">
                          <span className="cal-block__title">{shortLabel}</span>
                          {event.booking_note && (
                            <Typography.Text className="cal-block__meta" title={event.booking_note}>
                              {event.booking_note}
                            </Typography.Text>
                          )}
                        </div>
                      </Tooltip>
```

Điểm khác biệt chính:
- Bỏ toàn bộ fallback text `'Không có'` / `'Không có ghi chú'` — render conditional `event.booking_note && (...)`, nếu falsy (null hoặc chuỗi rỗng `''`) thì không render gì cả (không phải render chuỗi rỗng — bỏ hẳn element).
- Thêm attribute `title={event.booking_note}` vào `Typography.Text` — khi bị ellipsis cắt, người dùng hover vào chữ vẫn thấy full text qua native browser tooltip (bổ sung, không thay thế AntD Tooltip đang bọc ngoài).

---

## File 2: `src/index.css`

Tìm rule hiện tại:

```css
.cal-block__meta {
  font-size: var(--text-xs);
  opacity: 0.85;
  color: inherit !important;
}
```

**Thay thành:**

```css
.cal-block__meta {
  font-size: var(--text-xs);
  opacity: 0.85;
  color: inherit !important;
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Lý do thêm `display: block`: `Typography.Text` của AntD render ra `<span>` (inline). `text-overflow: ellipsis`
không hoạt động đúng trên inline element trong container flex-column — cần `display: block` để phần tử
chiếm full width của `.cal-block__content` (flex column) thì `overflow`/`text-overflow` mới ăn.

---

## Sau khi sửa xong

1. `tsc -b --noEmit` — không cần thiết đổi type vì không đụng interface, chỉ đổi JSX/CSS.
2. Test bằng mắt trên chính data thật đang có trong DB:
   - Phòng có note dài như "Meal: Breakfast included" (phòng 101, 301, 302 ngày 29/06 và 01/07
     theo screenshot Hiếu gửi) → phải hiện 1 dòng, cắt `...` nếu tràn width block, KHÔNG wrap.
   - Phòng/booking có `booking_note = ''` hoặc NULL (đa số các booking khác) → KHÔNG hiện dòng
     meta nào dưới tên khách, chỉ còn `shortLabel` (tên khách) trong block.
   - Kiểm tra không còn hiện tượng chữ ở ô/dòng lân cận bị cắt cụt do tràn nội dung.
   - Hover vào block có note dài bị ellipsis → Tooltip AntD (bọc ngoài) đã hiện full text sẵn,
     không cần dựa vào native `title` attribute (native title chỉ là lớp phòng hộ thêm).

## Commit convention
```
fix(calendar): hide empty booking note and truncate to single line
```