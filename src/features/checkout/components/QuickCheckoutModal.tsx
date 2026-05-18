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
  bookingIds: string[]
  roomNumber: string
  guestName: string
  checkIn: string
  checkOut: string
  grandTotal: number
  paid: number
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
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

export function QuickCheckoutModal({ target, onClose }: CheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const { mutateAsync, isPending } = useCheckout()
  const { message } = useAppFeedback()

  // Reset form khi chuyển sang booking mới
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!target) return
    setPaymentMethod('cash')
    setNote('')
  }, [target?.bookingId])

  if (!target) {
    return null
  }

  const remaining = Math.max(0, target.grandTotal - target.paid)
  const hasDebt = remaining > 0

  const handleConfirm = async () => {
    try {
      await mutateAsync({
        groupId: target.groupId,
        bookingIds: target.bookingIds,
        paymentAmount: remaining,
        paymentMethod: hasDebt ? paymentMethod : undefined,
        note: note.trim() || undefined,
      })

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
          <span>
            {target.bookingIds.length > 1 ? 'Check-out nhóm phòng' : 'Check-out phòng'} {target.roomNumber}
          </span>
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

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text>Tổng hóa đơn</Text>
          <Text strong>{formatVND(target.grandTotal)}</Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text>Đã thu</Text>
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

      {hasDebt && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Text strong>
              <DollarOutlined /> Thu {formatVND(remaining)} qua:
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
          danger={hasDebt}
          loading={isPending}
          onClick={handleConfirm}
          icon={<LogoutOutlined />}
        >
          {hasDebt ? `Thu ${formatVND(remaining)} và Check-out` : 'Xác nhận Check-out'}
        </Button>
      </div>
    </Modal>
  )
}
