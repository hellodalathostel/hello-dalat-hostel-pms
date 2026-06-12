import { useEffect } from 'react'
import { Alert, Descriptions, Form, InputNumber, Modal, Radio, Typography } from 'antd'
import dayjs from 'dayjs'
import { type EarlyLateType, useAddEarlyLate } from '@/hooks/useAddEarlyLate'

const { Text } = Typography

interface Booking {
  id: string
  room_id: string
  check_in: string
  check_out: string
  price_per_night: number
  has_early_check_in: boolean
  has_late_check_out: boolean
  status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled'
}

interface EarlyLateModalProps {
  open: boolean
  booking: Booking | null
  defaultType?: EarlyLateType
  onClose: () => void
  onSuccess?: () => void
}

interface FormValues {
  type: EarlyLateType
  fee: number
}

export function EarlyLateModal({
  open,
  booking,
  defaultType = 'early',
  onClose,
  onSuccess,
}: EarlyLateModalProps) {
  const [form] = Form.useForm<FormValues>()
  const { mutate, isPending } = useAddEarlyLate()

  const watchedType = Form.useWatch('type', form)
  const currentType: EarlyLateType = watchedType ?? defaultType

  const suggestedFee = booking
    ? Math.round((booking.price_per_night * 0.5) / 1000) * 1000
    : 0

  const isBlocked = booking?.status === 'checked-out' || booking?.status === 'cancelled'

  const earlyDisabled = !booking || booking.has_early_check_in || isBlocked
  const lateDisabled = !booking || booking.has_late_check_out || isBlocked

  useEffect(() => {
    if (open && booking) {
      form.setFieldsValue({
        type: defaultType,
        fee: suggestedFee,
      })
    }
  }, [open, booking, defaultType, suggestedFee, form])

  if (!booking) return null

  const newCheckIn = dayjs(booking.check_in).subtract(1, 'day')
  const newCheckOut = dayjs(booking.check_out).add(1, 'day')

  const blockNight = currentType === 'early'
    ? `Đêm ${newCheckIn.format('DD/MM')} -> ${dayjs(booking.check_in).format('DD/MM')}`
    : `Đêm ${dayjs(booking.check_out).format('DD/MM')} -> ${newCheckOut.format('DD/MM')}`

  const submitDisabled = Boolean(isBlocked || (earlyDisabled && lateDisabled))

  const handleOk = () => {
    if (isBlocked) {
      return
    }

    form.validateFields().then((values) => {
      mutate(
        {
          bookingId: booking.id,
          type: values.type,
          fee: values.fee ?? 0,
        },
        {
          onSuccess: () => {
            onSuccess?.()
            onClose()
          },
        },
      )
    }).catch(() => {
      // AntD tự hiển thị lỗi dưới field — không cần toast thêm
    })
  }

  return (
    <Modal
      title="Early Check-in / Late Check-out"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Xác nhận"
      cancelText="Huỷ"
      okButtonProps={{ disabled: submitDisabled }}
      confirmLoading={isPending}
      destroyOnClose
    >
      <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Phòng">{booking.room_id}</Descriptions.Item>
        <Descriptions.Item label="Check-in">
          {dayjs(booking.check_in).format('DD/MM/YYYY')}
        </Descriptions.Item>
        <Descriptions.Item label="Check-out">
          {dayjs(booking.check_out).format('DD/MM/YYYY')}
        </Descriptions.Item>
        <Descriptions.Item label="Giá/đêm">
          {booking.price_per_night.toLocaleString('vi-VN')}đ
        </Descriptions.Item>
      </Descriptions>

      {isBlocked && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Booking đã checked-out hoặc cancelled, không thể áp dụng early/late."
        />
      )}

      <Form form={form} layout="vertical">
        <Form.Item name="type" label="Loại" rules={[{ required: true }]}>
          <Radio.Group>
            <Radio value="early" disabled={earlyDisabled}>
              Early Check-in
              {booking.has_early_check_in && <Text type="secondary"> (đã áp dụng)</Text>}
            </Radio>
            <Radio value="late" disabled={lateDisabled}>
              Late Check-out
              {booking.has_late_check_out && <Text type="secondary"> (đã áp dụng)</Text>}
            </Radio>
          </Radio.Group>
        </Form.Item>

        {!isBlocked && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              <span>
                Phòng sẽ bị block thêm: <strong>{blockNight}</strong>
              </span>
            }
          />
        )}

        <Form.Item
          name="fee"
          label={`Phí (gợi ý 50% = ${suggestedFee.toLocaleString('vi-VN')}đ)`}
          rules={[
            { required: true, message: 'Nhập phí (0 nếu miễn phí)' },
            { type: 'number', min: 0, message: 'Phí không được âm' },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            step={50000}
            formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value): 0 => parseInt(value?.replace(/[^\d]/g, '') || '0', 10) as 0}
            addonAfter="đ"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}