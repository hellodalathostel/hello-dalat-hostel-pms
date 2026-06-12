// Modal check-in thủ công — nhập thông tin 1 khách, gọi checkin_booking_txn
import { useEffect } from 'react'
import { Modal, Form, Input, Select, DatePicker, Space, Button, Divider, Typography } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useCheckIn } from '@/features/checkin/hooks/useCheckIn'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { DashboardRoom } from '@/types/dashboard'
import type { ManualCheckinFormValues } from '@/types/checkin'

const { Text } = Typography

interface Props {
  open: boolean
  room: DashboardRoom | null
  onClose: () => void
  onSuccess?: () => void
}

const DOCUMENT_TYPES = ['CCCD', 'Hộ chiếu', 'Giấy tờ khác'] as const
const GENDERS = ['Nam', 'Nữ'] as const

export function CheckInModal({ open, room, onClose, onSuccess }: Props) {
  const [form] = Form.useForm<ManualCheckinFormValues>()
  const checkIn = useCheckIn()
  const { isMobile } = useBreakpoint()
  const { message } = useAppFeedback()

  // Reset form mỗi lần mở modal
  useEffect(() => {
    if (open) {
      form.resetFields()
      // Mặc định khách Việt Nam
      form.setFieldsValue({ nationality: 'Việt Nam', document_type: 'CCCD' })
    }
  }, [open, form])

  const handleSubmit = async (values: ManualCheckinFormValues) => {
    if (!room?.booking_id) {
      message.error('Không tìm thấy booking — vui lòng đóng và mở lại.')
      return
    }

    try {
      const rawDateOfBirth = form.getFieldValue('date_of_birth')
      const dateOfBirth = rawDateOfBirth
        ? dayjs(rawDateOfBirth).format('YYYY-MM-DD')
        : ''

      await checkIn.mutateAsync({
        booking_id: room.booking_id,
        guests: [
          {
            full_name: values.full_name.trim(),
            document_type: values.document_type,
            document_number: values.document_number.trim(),
            date_of_birth: dateOfBirth,
            gender: values.gender ?? '',
            nationality: values.nationality.trim(),
            residency_type: undefined,
            province: undefined,
            district: undefined,
            ward: undefined,
            address_detail: undefined,
          },
        ],
      })

      onSuccess?.()
      onClose()
    } catch {
      // useCheckIn.onError da handle toast
    }
  }

  return (
    <Modal
      title={
        <Space>
          <UserOutlined />
          <span>Check-in — Phòng {room?.room_id}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '100%' : 520}
      style={isMobile ? { top: 0, margin: 0, maxWidth: '100vw', paddingBottom: 0 } : undefined}
      styles={isMobile ? { body: { padding: '16px 12px' } } : undefined}
      destroyOnClose
    >
      {/* Thông tin booking */}
      {room && (
        <>
          <Space direction="vertical" size={2} style={{ marginBottom: 16 }}>
            <Text type="secondary">
              Khách: <Text strong>{room.guest_name ?? '—'}</Text>
            </Text>
            <Text type="secondary">
              {dayjs(room.check_in).format('DD/MM/YYYY')} → {dayjs(room.check_out).format('DD/MM/YYYY')}
            </Text>
          </Space>
          <Divider style={{ margin: '0 0 20px' }} />
        </>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
      >
        <Form.Item
          name="full_name"
          label="Họ và tên"
          rules={[{ required: true, message: 'Nhập họ tên khách' }]}
        >
          <Input placeholder="NGUYEN VAN A" autoFocus />
        </Form.Item>

        {isMobile ? (
          <Space direction="vertical" style={{ width: '100%' }} size={0}>
            <Form.Item
              name="document_type"
              label="Loại giấy tờ"
              style={{ width: '100%' }}
              rules={[{ required: true }]}
            >
              <Select>
                {DOCUMENT_TYPES.map((t) => (
                  <Select.Option key={t} value={t}>{t}</Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="document_number"
              label="Số giấy tờ"
              style={{ width: '100%' }}
              rules={[{ required: true, message: 'Nhập số giấy tờ' }]}
            >
              <Input placeholder="012345678901" />
            </Form.Item>
          </Space>
        ) : (
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item
              name="document_type"
              label="Loại giấy tờ"
              style={{ width: '45%' }}
              rules={[{ required: true }]}
            >
              <Select>
                {DOCUMENT_TYPES.map((t) => (
                  <Select.Option key={t} value={t}>{t}</Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="document_number"
              label="Số giấy tờ"
              style={{ width: '55%' }}
              rules={[{ required: true, message: 'Nhập số giấy tờ' }]}
            >
              <Input placeholder="012345678901" />
            </Form.Item>
          </Space.Compact>
        )}

        {isMobile ? (
          <Space direction="vertical" style={{ width: '100%' }} size={0}>
            <Form.Item
              name="date_of_birth"
              label="Ngày sinh"
              style={{ width: '100%' }}
            >
              <DatePicker
                format="DD/MM/YYYY"
                style={{ width: '100%' }}
                placeholder="Chọn ngày sinh"
                disabledDate={(d) => d.isAfter(dayjs())}
              />
            </Form.Item>

            <Form.Item name="gender" label="Giới tính" style={{ width: '100%' }}>
              <Select placeholder="—" allowClear>
                {GENDERS.map((g) => (
                  <Select.Option key={g} value={g}>{g}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Space>
        ) : (
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item
              name="date_of_birth"
              label="Ngày sinh"
              style={{ flex: 1 }}
            >
              <DatePicker
                format="DD/MM/YYYY"
                style={{ width: '100%' }}
                placeholder="Chọn ngày sinh"
                disabledDate={(d) => d.isAfter(dayjs())}
              />
            </Form.Item>

            <Form.Item name="gender" label="Giới tính" style={{ flex: 1 }}>
              <Select placeholder="—" allowClear>
                {GENDERS.map((g) => (
                  <Select.Option key={g} value={g}>{g}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Space>
        )}

        <Form.Item
          name="nationality"
          label="Quốc tịch"
          rules={[{ required: true, message: 'Nhập quốc tịch' }]}
        >
          <Input placeholder="Việt Nam" />
        </Form.Item>

        <Divider style={{ margin: '8px 0 16px' }} />

        {isMobile ? (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Button
              type="primary"
              htmlType="submit"
              loading={checkIn.isPending}
              block
            >
              Xác nhận Check-in
            </Button>
            <Button onClick={onClose} block>Huỷ</Button>
          </Space>
        ) : (
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={onClose}>Huỷ</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={checkIn.isPending}
            >
              Xác nhận Check-in
            </Button>
          </Space>
        )}
      </Form>
    </Modal>
  )
}
