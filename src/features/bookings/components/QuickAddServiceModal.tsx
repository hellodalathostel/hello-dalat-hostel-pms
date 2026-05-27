import { useState } from 'react'
import {
  Modal,
  Form,
  Select,
  InputNumber,
  Input,
  Button,
  Space,
  Divider,
  Tag,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useAddBookingService } from '../hooks/useAddBookingService'

const SERVICE_CATALOG = [
  { id: 'svc_breakfast', name: 'Bữa sáng', price: 50000 },
  { id: 'svc_transfer', name: 'Đưa đón sân bay / ga tàu', price: 150000 },
  { id: 'svc_laundry', name: 'Giặt sấy (kg)', price: 25000 },
  { id: 'svc_water', name: 'Nước khoáng minibar', price: 15000 },
  { id: 'svc_motorbike', name: 'Thuê xe máy (ngày)', price: 120000 },
  { id: 'svc_tour', name: 'Tour Đà Lạt (người)', price: 250000 },
] as const

type ServiceId = (typeof SERVICE_CATALOG)[number]['id'] | 'custom'

interface QuickAddServiceModalProps {
  open: boolean
  bookingId: string
  groupId: string
  roomName?: string
  onClose: () => void
}

interface QuickAddServiceFormValues {
  service_id: ServiceId
  qty: number
  custom_name?: string
  custom_price?: number
}

export function QuickAddServiceModal({
  open,
  bookingId,
  groupId,
  roomName,
  onClose,
}: QuickAddServiceModalProps) {
  const [form] = Form.useForm<QuickAddServiceFormValues>()
  const [selectedId, setSelectedId] = useState<ServiceId | undefined>()
  const { mutate: addService, isPending } = useAddBookingService(groupId)

  const qty = Form.useWatch('qty', form) ?? 1
  const customPrice = Form.useWatch('custom_price', form) ?? 0
  const selectedCatalog = SERVICE_CATALOG.find((service) => service.id === selectedId)
  const previewPrice = selectedId === 'custom'
    ? customPrice * qty
    : (selectedCatalog?.price ?? 0) * qty

  const handleClose = () => {
    form.resetFields()
    setSelectedId(undefined)
    onClose()
  }

  const handleSubmit = () => {
    void form.validateFields().then((values) => {
      if (values.service_id === 'custom') {
        addService(
          {
            bookingId,
            qty: values.qty,
            customName: values.custom_name,
            customPrice: values.custom_price,
          },
          { onSuccess: handleClose },
        )
      } else {
        addService(
          {
            bookingId,
            serviceId: values.service_id,
            qty: values.qty,
          },
          { onSuccess: handleClose },
        )
      }
    })
  }

  return (
    <Modal
      title={`Thêm dịch vụ${roomName ? ` — ${roomName}` : ''}`}
      open={open}
      onCancel={handleClose}
      footer={(
        <Space>
          <Button onClick={handleClose} disabled={isPending}>Huỷ</Button>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={isPending}
            icon={<PlusOutlined />}
          >
            Thêm
          </Button>
        </Space>
      )}
      width={420}
      destroyOnClose
    >
      <Form form={form} layout="vertical" initialValues={{ qty: 1 }}>
        <Form.Item
          name="service_id"
          label="Dịch vụ"
          rules={[{ required: true, message: 'Chọn dịch vụ' }]}
        >
          <Select
            placeholder="Chọn dịch vụ..."
            onChange={(value: ServiceId) => {
              setSelectedId(value)
              form.setFieldsValue({ custom_name: undefined, custom_price: undefined })
            }}
            options={[
              ...SERVICE_CATALOG.map((service) => ({
                value: service.id,
                label: (
                  <Space>
                    <span>{service.name}</span>
                    <Tag color="blue">{service.price.toLocaleString('vi-VN')}đ</Tag>
                  </Space>
                ),
              })),
              { value: 'custom', label: 'Dịch vụ khác (nhập tay)' },
            ]}
          />
        </Form.Item>

        {selectedId === 'custom' && (
          <>
            <Form.Item
              name="custom_name"
              label="Tên dịch vụ"
              rules={[{ required: true, message: 'Nhập tên dịch vụ' }]}
            >
              <Input placeholder="VD: Thuê xe đạp" />
            </Form.Item>
            <Form.Item
              name="custom_price"
              label="Đơn giá (VNĐ)"
              rules={[{ required: true, message: 'Nhập đơn giá' }]}
            >
              <InputNumber<number>
                style={{ width: '100%' }}
                min={0}
                step={5000}
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => Number((value ?? '').replace(/,/g, ''))}
                placeholder="50000"
              />
            </Form.Item>
          </>
        )}

        <Form.Item
          name="qty"
          label="Số lượng"
          rules={[
            { required: true, message: 'Nhập số lượng' },
            { type: 'number', min: 1, message: 'Tối thiểu 1' },
          ]}
        >
          <InputNumber<number> min={1} style={{ width: '100%' }} />
        </Form.Item>

        {selectedId && previewPrice > 0 && (
          <>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ textAlign: 'right', color: '#1677ff', fontWeight: 600 }}>
              Tổng: {previewPrice.toLocaleString('vi-VN')}đ
            </div>
          </>
        )}
      </Form>
    </Modal>
  )
}
