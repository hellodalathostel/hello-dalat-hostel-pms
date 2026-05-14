import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Steps,
  Table,
  Typography,
  message,
} from 'antd'
import { CheckCircleOutlined, CreditCardOutlined, DollarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useBookingFolio } from '@/hooks/useBookingFolio'
import { useCheckoutBooking, useRecordPayment } from '@/hooks/useCheckoutBooking'
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

type PaymentFormValues = {
  amount: number
  method: PaymentMethod
  note?: string
}

export function CheckoutModal({ bookingId, open, onClose }: Props) {
  const [step, setStep] = useState<Step>('folio')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [form] = Form.useForm<PaymentFormValues>()

  const { data: folio, isLoading, error } = useBookingFolio(open ? bookingId : null)
  const recordPayment = useRecordPayment()
  const checkoutBooking = useCheckoutBooking()

  useEffect(() => {
    if (!open) {
      setStep('folio')
      setPaymentMethod('cash')
      form.resetFields()
    }
  }, [form, open])

  const stepIndex = step === 'folio' ? 0 : step === 'payment' ? 1 : 2
  const minPaymentAmount: number = 0

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
    form.resetFields()
    onClose()
  }

  const handleCheckoutOnly = async () => {
    if (!bookingId) {
      return
    }

    try {
      await checkoutBooking.mutateAsync({ bookingId })
      setStep('done')
      message.success('Checkout thành công')
    } catch {
      // Lỗi đã được hiển thị ở hook.
    }
  }

  const handleSubmitPayment = async () => {
    if (!folio || !bookingId) {
      return
    }

    const values = await form.validateFields()

    try {
      await recordPayment.mutateAsync({
        groupId: folio.group.id,
        amount: values.amount,
        method: values.method,
        note: values.note,
        firstBookingId: values.method === 'card' ? bookingId : undefined,
      })

      await checkoutBooking.mutateAsync({ bookingId })
      setStep('done')
      message.success('Checkout và ghi payment thành công')
    } catch {
      // Lỗi đã được hiển thị ở hook.
    }
  }

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
                <Text type="secondary">Tiền phòng</Text>
                <Text>{formatVND(folio.booking.price)}</Text>
              </div>

              {folio.booking.surcharge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">Phụ thu thẻ</Text>
                  <Text>{formatVND(folio.booking.surcharge)}</Text>
                </div>
              )}

              {folio.services.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">Dịch vụ</Text>
                  <Text>{formatVND(folio.services.reduce((sum, item) => sum + item.subtotal, 0))}</Text>
                </div>
              )}

              {folio.discounts.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">Giảm giá</Text>
                  <Text type="danger">
                    -{formatVND(folio.discounts.reduce((sum, item) => sum + item.amount, 0))}
                  </Text>
                </div>
              )}

              <Divider style={{ margin: '6px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text strong>Grand Total</Text>
                <Text strong style={{ fontSize: 16 }}>{formatVND(folio.booking.grandTotal)}</Text>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text type="secondary">Đã trả</Text>
                <Text type="success">-{formatVND(folio.group.paid)}</Text>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text strong>
                  {folio.remaining > 0 ? 'Còn lại' : folio.remaining < 0 ? 'Trả dư' : 'Đã thanh toán đủ'}
                </Text>
                <Text
                  strong
                  style={{
                    fontSize: 18,
                    color: folio.remaining > 0 ? '#f5222d' : folio.remaining < 0 ? '#fa8c16' : '#52c41a',
                  }}
                >
                  {folio.remaining < 0 ? '+' : ''}{formatVND(Math.abs(folio.remaining))}
                </Text>
              </div>
            </Space>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={handleClose}>Huỷ</Button>
            {folio.remaining <= 0 ? (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={checkoutBooking.isPending}
                onClick={handleCheckoutOnly}
              >
                Checkout ngay
              </Button>
            ) : (
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
            message={`Còn lại: ${formatVND(folio.remaining)}`}
            style={{ marginBottom: 16 }}
          />

          <Form
            form={form}
            layout="vertical"
            initialValues={{
              amount: folio.remaining > 0 ? folio.remaining : 0,
              method: 'cash',
            }}
          >
            <Form.Item
              label="Số tiền thu"
              name="amount"
              rules={[
                { required: true, message: 'Nhập số tiền' },
                { type: 'number', min: 1, message: 'Phải lớn hơn 0' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={minPaymentAmount}
                step={10000}
                formatter={(value) => (value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
                parser={(value) => Number((value ?? '').toString().replace(/,/g, ''))}
                addonAfter="VND"
              />
            </Form.Item>

            <Form.Item
              label="Phương thức"
              name="method"
              rules={[{ required: true, message: 'Chọn phương thức thanh toán' }]}
            >
              <Select
                onChange={(value: PaymentMethod) => setPaymentMethod(value)}
                options={[
                  { value: 'cash', label: 'Tiền mặt' },
                  { value: 'transfer', label: 'Chuyển khoản' },
                  { value: 'card', label: 'Thẻ (+4%)' },
                  { value: 'other', label: 'Khác' },
                ]}
              />
            </Form.Item>

            {paymentMethod === 'card' && (
              <Alert
                type="warning"
                showIcon
                icon={<CreditCardOutlined />}
                message="Thanh toán thẻ sẽ cộng surcharge 4% vào booking đầu tiên."
                style={{ marginBottom: 12 }}
              />
            )}

            <Form.Item label="Ghi chú" name="note">
              <Input.TextArea rows={2} placeholder="Tuỳ chọn" />
            </Form.Item>
          </Form>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setStep('folio')}>Quay lại</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={recordPayment.isPending || checkoutBooking.isPending}
              onClick={handleSubmitPayment}
            >
              Xác nhận và Checkout
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
