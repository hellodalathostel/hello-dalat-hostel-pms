import { useState } from 'react'
import { InputNumber, Radio, Space, Switch, Typography } from 'antd'
import type { BookingDetailItem } from '@/features/bookings/hooks/useBookingDetail'
import { useUpdateBookingBreakfast } from '@/features/bookings/hooks/useUpdateBookingBreakfast'

const { Text } = Typography

interface Props {
  booking: BookingDetailItem
  groupId: string
  readOnly?: boolean
}

// Ghi nhận ăn sáng free/paid trên booking — RPC update_booking_breakfast_txn.
// Suất tính theo check_in < ngày ≤ check_out, tức đúng bằng `nights`.
// hasBreakfast/breakfastType đọc trực tiếp từ booking (server là nguồn sự thật);
// chỉ qtyPerNight giữ state cục bộ vì InputNumber cần gõ xong (onBlur) mới lưu.
export function BreakfastSection({ booking, groupId, readOnly = false }: Props) {
  const hasBreakfast = booking.has_breakfast
  const breakfastType = booking.breakfast_type ?? 'free'
  const [qtyPerNight, setQtyPerNight] = useState(booking.breakfast_qty_per_night || 1)

  const { mutate: updateBreakfast, isPending } = useUpdateBookingBreakfast()

  const handleSave = (nextHasBreakfast: boolean, nextType: 'free' | 'paid', nextQty: number) => {
    updateBreakfast({
      bookingId: booking.id,
      groupId,
      hasBreakfast: nextHasBreakfast,
      breakfastType: nextHasBreakfast ? nextType : null,
      qtyPerNight: nextHasBreakfast ? nextQty : 0,
    })
  }

  const nights = booking.nights ?? 0
  const totalServings = qtyPerNight * nights

  return (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginTop: 8 }}>
      <Space align="center" style={{ marginBottom: hasBreakfast ? 8 : 0 }}>
        <Switch
          checked={hasBreakfast}
          disabled={readOnly}
          loading={isPending}
          onChange={(checked) => handleSave(checked, breakfastType, qtyPerNight)}
        />
        <Text strong>Ăn sáng</Text>
      </Space>

      {hasBreakfast && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Radio.Group
            value={breakfastType}
            disabled={readOnly}
            onChange={(e) => handleSave(true, e.target.value as 'free' | 'paid', qtyPerNight)}
          >
            <Radio.Button value="free">Free</Radio.Button>
            <Radio.Button value="paid">Có phí</Radio.Button>
          </Radio.Group>

          <Space align="center">
            <Text>Số suất/ngày:</Text>
            <InputNumber
              min={1}
              value={qtyPerNight}
              disabled={readOnly}
              onChange={(val) => {
                if (val === null) return
                setQtyPerNight(val)
              }}
              onBlur={() => {
                if (qtyPerNight !== booking.breakfast_qty_per_night) {
                  handleSave(true, breakfastType, qtyPerNight)
                }
              }}
              style={{ width: 80 }}
            />
          </Space>

          <Text type="secondary" style={{ fontSize: 12 }}>
            Tổng: {qtyPerNight} suất × {nights} đêm = {totalServings} suất
          </Text>
        </Space>
      )}
    </div>
  )
}
