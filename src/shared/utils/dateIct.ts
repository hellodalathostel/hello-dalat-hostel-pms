// Ngày theo giờ Việt Nam (Asia/Ho_Chi_Minh) — không phụ thuộc múi giờ trình duyệt.

// Hôm nay theo ICT (YYYY-MM-DD) — không dùng toISOString() vì lệch ngày trước 07:00 sáng.
export function getTodayIct(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

// Rule 2: ngày check-in dự kiến (YYYY-MM-DD) còn ở tương lai so với hôm nay ICT → chưa được nhận phòng.
// Khớp điều kiện trong checkin_booking_txn: (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < check_in.
export function isFutureCheckinIct(checkIn: string | null | undefined): boolean {
  if (!checkIn) return false
  return checkIn.slice(0, 10) > getTodayIct()
}
