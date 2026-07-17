// src/features/checkout/components/CheckoutModal.tsx
// v2 — Thay đổi so với v1:
//   1. Dùng useCheckoutBooking({ bookingId, isLastActiveBooking, paymentMethod, note })
//      thay vì gọi useRecordPayment() + useCheckoutBooking() rời nhau.
//   2. Khi KHÔNG phải booking cuối (isLastActiveBooking=false): ẩn hẳn form thu tiền,
//      hiển thị rõ "phòng này không thu tiền, sẽ thu khi checkout phòng cuối cùng của đoàn".
//   3. Khi thanh toán thẻ: hiển thị rõ 3 dòng — Số dư gốc / Phụ phí thẻ 4% / Tổng thực thu.
//   4. remaining giờ lấy từ folio.remaining (đã sửa group-level ở useBookingFolio v2).
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Descriptions,
  Divider,
  Input,
  Modal,
  Select,
  Space,
  Steps,
  Table,
  Typography,
} from 'antd'
import { CheckCircleOutlined, CreditCardOutlined, DollarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useBookingFolio } from '@/features/bookings/hooks/useBookingFolio'
import { useCheckoutBooking } from '@/features/checkout/hooks/useCheckoutBooking'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { PaymentMethod } from '@/types/database'

const { Text, Title } = Typography

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

interface Props {
  bookingId: string | null
  open: boolean
  onClose: () => void
}

type Step = 'folio' | 'payment' | 'done'

const CARD_SURCHARGE_RATE = 0.04

export function CheckoutModal({ bookingId, open, onClose }: Props) {
  const { message } = useAppFeedback()
  const [step, setStep] = useState<Step>('folio')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')

  const { data: folio, isLoading, error } = useBookingFolio(open ? bookingId : null)
  const checkoutBooking = useCheckoutBooking()

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep('folio')
      setPaymentMethod('cash')
      setNote('')
    }
  }, [open])

  const stepIndex = step === 'folio' ? 0 : step === 'payment' ? 1 : 2

  const serviceColumns = useMemo(() => [
    { title: 'Dịch vụ', dataIndex: 'name', key: 'name' },
    { title: 'SL', dataIndex: 'qty', key: 'qty', width: 60 },
    {
      title: 'Đơn giá',
      dataIndex: 'price',
      key: 'price',
      render: (value: number) => formatVND(value),
    },
    {
      title: 'Thành tiền',
      dataIndex: 'subtotal',
      key: 'subtotal',
      render: (value: number) => <Text strong>{formatVND(value)}</Text>,
    },
  ], [])

  const handleClose = () => {
    setStep('folio')
    setPaymentMethod('cash')
    setNote('')
    onClose()
  }

  // Booking KHÔNG phải cuối cùng → checkout luôn, không thu tiền, không hỏi payment method.
  const handleCheckoutNonFinal = async () => {
    if (!bookingId) return

    try {
      await checkoutBooking.mutateAsync({
        bookingId,
        isLastActiveBooking: false,
      })
      setStep('done')
      message.success('Checkout thành công')
    } catch {
      // Lỗi đã hiển thị ở hook.
    }
  }

  // Booking đã hết nợ (remaining <= 0) — checkout cuối cùng, không cần chọn payment method.
  const handleCheckoutFinalNoDebt = async () => {
    if (!bookingId || !folio) return

    try {
      await checkoutBooking.mutateAsync({
        bookingId,
        isLastActiveBooking: true,
        // #4 Kể cả khi UI nghĩ là hết nợ, vẫn gửi expected để RPC chặn nếu group vừa phát sinh nợ mới.
        // Guard `!folio` ở trên đảm bảo 2 field này luôn là number (không undefined) — khớp
        // discriminated union CheckoutParamsLast.
        expectedGroupGrandTotal: folio.group.grandTotal,
        expectedGroupPaid: folio.group.paid,
      })
      setStep('done')
      message.success('Checkout thành công')
    } catch {
      // Lỗi đã hiển thị ở hook.
    }
  }

  // Booking cuối cùng còn nợ — thu tiền + checkout trong 1 lệnh atomic.
  const handleSettleAndCheckout = async () => {
    if (!bookingId || !folio) return

    try {
      await checkoutBooking.mutateAsync({
        bookingId,
        isLastActiveBooking: true,
        paymentMethod,
        note: note.trim() || undefined,
        // #4 Gửi số staff đang nhìn thấy để RPC chặn nếu group đã bị thay đổi bởi phiên khác.
        expectedGroupGrandTotal: folio.group.grandTotal,
        expectedGroupPaid: folio.group.paid,
      })
      setStep('done')
      message.success('Checkout và ghi payment thành công')
    } catch {
      // Lỗi đã hiển thị ở hook.
    }
  }

  const remaining = folio?.remaining ?? 0
  const surchargeAmount = paymentMethod === 'card' ? Math.round(remaining * CARD_SURCHARGE_RATE) : 0
  const totalToCollect = remaining + surchargeAmount

  return (
    <Modal
      title={`Checkout - Phòng ${folio?.booking.roomNumber ?? '...'}`}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      <Steps
        current={stepIndex}
        size="small"
        style={{ marginBottom: 24 }}
        items={[
          { title: 'Folio' },
          { title: 'Thanh toán' },
          { title: 'Hoàn tất' },
        ]}
      />

      {isLoading && <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div>}
      {error && <Alert type="error" message="Không tải được dữ liệu folio" />}

      {!isLoading && folio && step === 'folio' && (
        <>
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Khách">{folio.booking.guestName}</Descriptions.Item>
            <Descriptions.Item label="Phòng">{folio.booking.roomNumber}</Descriptions.Item>
            <Descriptions.Item label="Check-in">
              {dayjs(folio.booking.checkIn).format('DD/MM/YYYY')}
            </Descriptions.Item>
            <Descriptions.Item label="Check-out">
              {dayjs(folio.booking.checkOut).format('DD/MM/YYYY')}
            </Descriptions.Item>
          </Descriptions>

          <Table
            size="small"
            pagination={false}
            rowKey="id"
            columns={serviceColumns}
            dataSource={folio.services}
            locale={{ emptyText: 'Không có dịch vụ phát sinh' }}
            style={{ marginBottom: 12 }}
          />

          {!folio.isLastActiveBooking && (
            <Alert
              type="info"
              showIcon
              message="Phòng này không phải phòng cuối cùng của đoàn"
              description="Sẽ không thu tiền ở bước checkout phòng này. Số dư của cả đoàn sẽ được tính và thu khi checkout phòng cuối cùng."
              style={{ marginBottom: 16 }}
            />
          )}

          <div
            style={{
              background: '#fafafa',
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
            }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text type="secondary">Tiền phòng (booking này)</Text>
                <Text>{formatVND(folio.booking.roomSubtotal)}</Text>
              </div>

              {folio.booking.surcharge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">Phụ thu thẻ (booking này)</Text>
                  <Text>{formatVND(folio.booking.surcharge)}</Text>
                </div>
              )}

              {folio.services.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">Dịch vụ (booking này)</Text>
                  <Text>{formatVND(folio.services.reduce((sum, item) => sum + item.subtotal, 0))}</Text>
                </div>
              )}

              {folio.discounts.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">Giảm giá (booking này)</Text>
                  <Text type="danger">
                    -{formatVND(folio.discounts.reduce((sum, item) => sum + item.amount, 0))}
                  </Text>
                </div>
              )}

              <Divider style={{ margin: '6px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text strong>Grand Total cả đoàn</Text>
                <Text strong style={{ fontSize: 16 }}>{formatVND(folio.group.grandTotal)}</Text>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text type="secondary">Đã trả (cả đoàn)</Text>
                <Text type="success">-{formatVND(folio.group.paid)}</Text>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text strong>
                  {remaining > 0 ? 'Còn lại (cả đoàn)' : remaining < 0 ? 'Trả dư' : 'Đã thanh toán đủ'}
                </Text>
                <Text
                  strong
                  style={{
                    fontSize: 18,
                    color: remaining > 0 ? '#f5222d' : remaining < 0 ? '#fa8c16' : '#52c41a',
                  }}
                >
                  {remaining < 0 ? '+' : ''}{formatVND(Math.abs(remaining))}
                </Text>
              </div>
            </Space>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={handleClose}>Huỷ</Button>
            {!folio.isLastActiveBooking && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={checkoutBooking.isPending}
                onClick={handleCheckoutNonFinal}
              >
                Checkout ngay (không thu tiền)
              </Button>
            )}
            {folio.isLastActiveBooking && remaining <= 0 && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={checkoutBooking.isPending}
                onClick={handleCheckoutFinalNoDebt}
              >
                Checkout ngay
              </Button>
            )}
            {folio.isLastActiveBooking && remaining > 0 && (
              <Button
                type="primary"
                icon={<DollarOutlined />}
                onClick={() => setStep('payment')}
              >
                Nhập thanh toán
              </Button>
            )}
          </div>
        </>
      )}

      {step === 'payment' && folio && (
        <>
          <Alert
            type="info"
            showIcon
            message={`Còn lại (cả đoàn): ${formatVND(remaining)}`}
            style={{ marginBottom: 16 }}
          />

          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>Phương thức</Text>
              <Select
                value={paymentMethod}
                onChange={(value: PaymentMethod) => setPaymentMethod(value)}
                style={{ width: '100%' }}
                options={[
                  { value: 'cash', label: 'Tiền mặt' },
                  { value: 'transfer', label: 'Chuyển khoản' },
                  { value: 'card', label: 'Thẻ (+4%)' },
                  { value: 'momo', label: 'MoMo' },
                  { value: 'zalopay', label: 'ZaloPay' },
                  { value: 'other', label: 'Khác' },
                ]}
              />
            </div>

            {paymentMethod === 'card' && (
              <div
                style={{
                  background: '#fffbe6',
                  border: '1px solid #ffe58f',
                  borderRadius: 8,
                  padding: '12px 16px',
                }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary">Số dư gốc</Text>
                    <Text>{formatVND(remaining)}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary">
                      <CreditCardOutlined /> Phụ phí thẻ (4%)
                    </Text>
                    <Text type="warning">+{formatVND(surchargeAmount)}</Text>
                  </div>
                  <Divider style={{ margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong>Tổng thực thu</Text>
                    <Text strong style={{ fontSize: 16 }}>{formatVND(totalToCollect)}</Text>
                  </div>
                </Space>
              </div>
            )}

            {paymentMethod !== 'card' && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text strong>Tổng thực thu</Text>
                <Text strong style={{ fontSize: 16 }}>{formatVND(totalToCollect)}</Text>
              </div>
            )}

            <div>
              <Text style={{ display: 'block', marginBottom: 4 }}>Ghi chú</Text>
              <Input.TextArea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Tuỳ chọn"
              />
            </div>
          </Space>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setStep('folio')}>Quay lại</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={checkoutBooking.isPending}
              onClick={handleSettleAndCheckout}
            >
              Xác nhận thu {formatVND(totalToCollect)} và Checkout
            </Button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <Title level={4}>Checkout thành công</Title>
          <Text type="secondary">Phòng {folio?.booking.roomNumber} đã được trả.</Text>
          <br />
          <br />
          <Button type="primary" onClick={handleClose}>Đóng</Button>
        </div>
      )}
    </Modal>
  )
}
