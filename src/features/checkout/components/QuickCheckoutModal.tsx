// src/features/checkout/components/QuickCheckoutModal.tsx
// v2 — Thay đổi so với v1:
//   1. CheckoutTarget.grandTotal (booking-level, SAI khi group nhiều phòng) →
//      đổi thành groupGrandTotal (lấy từ dashboard_today.group_grand_total).
//   2. Thêm CheckoutTarget.isLastActiveBooking (từ dashboard_today.is_last_active_booking).
//   3. Khi isLastActiveBooking=false: ẩn hẳn phần thu tiền, chỉ hiện nút checkout đơn thuần.
//   4. Khi chọn "Thẻ": hiển thị rõ Số dư gốc / Phụ phí 4% / Tổng thực thu.
import { useEffect, useState } from 'react'
import { Button, Divider, Input, Modal, Select, Space, Tag, Typography } from 'antd'
import { DollarOutlined, LogoutOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useCheckout } from '@/features/checkout/hooks/useCheckOut'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { PaymentMethod } from '@/types/database'

const { Text, Title } = Typography

export interface CheckoutTarget {
  bookingId: string
  groupId: string
  roomNumber: string
  guestName: string
  checkIn: string
  checkOut: string
  /** SỬA: group_grand_total (cả đoàn), không còn dùng grand_total của riêng booking này */
  groupGrandTotal: number
  paid: number
  /** Từ dashboard_today.is_last_active_booking */
  isLastActiveBooking: boolean
}

interface CheckoutModalProps {
  target: CheckoutTarget | null
  onClose: () => void
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  card: 'Thẻ',
  other: 'Khác',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
}

const CARD_SURCHARGE_RATE = 0.04

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

export function QuickCheckoutModal({ target, onClose }: CheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const { mutateAsync, isPending } = useCheckout()
  const { message } = useAppFeedback()

  useEffect(() => {
    if (!target) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaymentMethod('cash')
    setNote('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.bookingId])

  if (!target) {
    return null
  }

  const remaining = Math.max(0, target.groupGrandTotal - target.paid)
  const hasDebt = remaining > 0
  const canSettle = target.isLastActiveBooking
  const surchargeAmount = paymentMethod === 'card' ? Math.round(remaining * CARD_SURCHARGE_RATE) : 0
  const totalToCollect = remaining + surchargeAmount

  const handleConfirm = async () => {
    try {
      // Tách 2 nhánh tường minh (không gán target.isLastActiveBooking trực tiếp) để TypeScript
      // narrow đúng discriminated union CheckoutPayload — target.isLastActiveBooking là `boolean`
      // (không phải literal true/false), nên gán thẳng không đủ để compiler xác định nhánh.
      if (target.isLastActiveBooking) {
        await mutateAsync({
          groupId: target.groupId,
          bookingId: target.bookingId,
          isLastActiveBooking: true,
          paymentAmount: totalToCollect,
          paymentMethod: hasDebt ? paymentMethod : undefined,
          note: note.trim() || undefined,
          // Gửi số staff đang thấy (từ dashboard_today) để RPC chặn nếu group đã đổi.
          expectedGroupGrandTotal: target.groupGrandTotal,
          expectedGroupPaid: target.paid,
        })
      } else {
        await mutateAsync({
          groupId: target.groupId,
          bookingId: target.bookingId,
          isLastActiveBooking: false,
          paymentAmount: 0,
        })
      }

      message.success(`Đã check-out phòng ${target.roomNumber}`)
      onClose()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Checkout thất bại'
      message.error(errorMessage)
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onCancel={onClose}
      title={
        <Space>
          <LogoutOutlined />
          <span>Check-out phòng {target.roomNumber}</span>
        </Space>
      }
      footer={null}
      width={440}
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>{target.guestName}</Title>
        <Text type="secondary">
          {dayjs(target.checkIn).format('DD/MM/YYYY')} - {dayjs(target.checkOut).format('DD/MM/YYYY')}
        </Text>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {!canSettle && (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Text type="secondary">
            Phòng này không phải phòng cuối cùng của đoàn. Sẽ không thu tiền ở bước này —
            số dư cả đoàn sẽ được tính và thu khi checkout phòng cuối cùng.
          </Text>
        </Space>
      )}

      {canSettle && (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text>Tổng hóa đơn (cả đoàn)</Text>
            <Text strong>{formatVND(target.groupGrandTotal)}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text>Đã thu (cả đoàn)</Text>
            <Text style={{ color: '#52c41a' }}>{formatVND(target.paid)}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text strong>Còn lại</Text>
            {hasDebt ? (
              <Tag color="red" style={{ fontSize: 14, padding: '2px 8px' }}>
                {formatVND(remaining)}
              </Tag>
            ) : (
              <Tag color="green">Đã thanh toán đủ</Tag>
            )}
          </div>
        </Space>
      )}

      {canSettle && hasDebt && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Text strong>
              <DollarOutlined /> Thu qua:
            </Text>
            <Select
              value={paymentMethod}
              onChange={(value) => setPaymentMethod(value as PaymentMethod)}
              style={{ width: '100%' }}
              options={Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            {paymentMethod === 'card' && (
              <div
                style={{
                  background: '#fffbe6',
                  border: '1px solid #ffe58f',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary">Số dư gốc</Text>
                    <Text>{formatVND(remaining)}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary">Phụ phí thẻ (4%)</Text>
                    <Text type="warning">+{formatVND(surchargeAmount)}</Text>
                  </div>
                  <Divider style={{ margin: '2px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong>Tổng thực thu</Text>
                    <Text strong>{formatVND(totalToCollect)}</Text>
                  </div>
                </Space>
              </div>
            )}
            <Input.TextArea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ghi chú thanh toán (không bắt buộc)"
            />
          </Space>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        <Button onClick={onClose} disabled={isPending}>Huỷ</Button>
        <Button
          type="primary"
          danger={canSettle && hasDebt}
          loading={isPending}
          onClick={handleConfirm}
          icon={<LogoutOutlined />}
        >
          {canSettle && hasDebt ? `Thu ${formatVND(totalToCollect)} và Check-out` : 'Xác nhận Check-out'}
        </Button>
      </div>
    </Modal>
  )
}
