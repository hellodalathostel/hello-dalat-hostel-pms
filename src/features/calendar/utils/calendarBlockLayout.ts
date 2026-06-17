// Tính vị trí (left/width theo %) của 1 khối booking trên lưới calendar,
// có clamp khi booking vắt qua biên khung nhìn (check-in trước ngày đầu lưới
// hoặc check-out sau ngày cuối lưới).
import dayjs from 'dayjs'

export interface CalendarBlockLayout {
  /** % left tính từ rawStart đã clamp, dùng trực tiếp trong style.left */
  leftPct: number
  /** % width tính từ (rawEnd - rawStart) đã clamp, dùng trực tiếp trong style.width */
  widthPct: number
  /** true nếu đầu trái bị cắt (check-in trước khung nhìn) */
  isClippedStart: boolean
  /** true nếu đầu phải bị cắt (check-out sau khung nhìn) */
  isClippedEnd: boolean
}

/**
 * @param rawStart   Index ngày bắt đầu booking, tính từ startDate của khung nhìn (có thể âm)
 * @param rawEnd     Index ngày kết thúc booking (rawStart + số đêm), có thể > numDays
 * @param numDays    Tổng số ngày hiển thị trong khung nhìn calendar
 * @returns null nếu booking nằm hoàn toàn ngoài khung nhìn hoặc range không hợp lệ — không render
 */
export function computeCalendarBlockLayout(
  rawStart: number,
  rawEnd: number,
  numDays: number,
): CalendarBlockLayout | null {
  // Booking nằm hoàn toàn ngoài khung nhìn — không render
  if (rawEnd <= 0 || rawStart >= numDays) {
    return null
  }

  const clampedStart = Math.max(0, rawStart)
  const clampedEnd = Math.min(numDays, rawEnd)

  // Range không hợp lệ sau clamp (dữ liệu lỗi, 0 đêm) — không render, tránh chia 0 / khối ngược
  if (clampedEnd <= clampedStart) {
    return null
  }

  const leftPct = (clampedStart / numDays) * 100
  const widthPct = ((clampedEnd - clampedStart) / numDays) * 100

  return {
    leftPct,
    widthPct,
    isClippedStart: clampedStart > rawStart,
    isClippedEnd: clampedEnd < rawEnd,
  }
}

/**
 * Helper: tính rawStart/rawEnd (đơn vị: index ngày) từ ngày thật của booking
 * so với ngày bắt đầu khung nhìn calendar. Dùng dayjs để tránh lỗi timezone/DST.
 *
 * @param checkIn        dayjs object — ngày check-in của booking
 * @param checkOut       dayjs object — ngày check-out của booking (checkout-exclusive,
 *                        tức đêm cuối là check_out - 1, theo quy ước đã chốt ở useRoomCalendar.ts)
 * @param viewStartDate  dayjs object — ngày đầu tiên hiển thị trên lưới calendar
 */
export function dateRangeToRawIndices(
  checkIn: dayjs.Dayjs,
  checkOut: dayjs.Dayjs,
  viewStartDate: dayjs.Dayjs,
): { rawStart: number; rawEnd: number } {
  const rawStart = checkIn.diff(viewStartDate, 'day')
  const rawEnd = checkOut.diff(viewStartDate, 'day')
  return { rawStart, rawEnd }
}
