// Hàm format hiển thị dùng chung (U-09, QA 15/10/2026).
// CHỈ đổi text hiển thị — không dùng các hàm này để tạo giá trị lưu DB
// (ngày gửi DB vẫn là dayjs(...).format('YYYY-MM-DD')).
import dayjs from 'dayjs'

const NUMBER_VI = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

// 300000 → "300.000đ"; null/undefined → "—"
export function formatMoney(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  return `${NUMBER_VI.format(Math.round(amount))}đ`
}

// '2026-10-16' | Date | Dayjs → "16/10/2026"; rỗng → "—"
export function formatDate(value: string | Date | dayjs.Dayjs | null | undefined): string {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : '—'
}

// Nhãn phòng thống nhất cho mọi Select phòng (U-03):
// "301 — Standard Double — tối đa 2 khách"
export function formatRoomLabel(room: {
  id: string
  name?: string | null
  capacity?: number | null
}): string {
  const parts = [room.id]
  if (room.name && room.name !== room.id) parts.push(room.name)
  if (room.capacity) parts.push(`tối đa ${room.capacity} khách`)
  return parts.join(' — ')
}

// Phương thức thanh toán hiển thị tiếng Việt (U-05). Giá trị lưu DB giữ nguyên tiếng Anh.
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  card: 'Thẻ',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  shopeepay: 'ShopeePay',
  ota: 'OTA',
  other: 'Khác',
}

export function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return '—'
  return PAYMENT_METHOD_LABEL[method] ?? method
}
