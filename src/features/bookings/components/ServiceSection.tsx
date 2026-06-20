import { Button, Empty, InputNumber, Select, Spin, Table, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useServices } from '@/features/bookings/hooks/useServices'
import type { ServiceLineItem } from '@/features/bookings/types/booking'

const { Text } = Typography
const VND_FORMATTER = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

interface Props {
  bookingCount: number
  bookingLabels: string[]
  value: ServiceLineItem[]
  onChange: (items: ServiceLineItem[]) => void
}

export function ServiceSection({
  bookingCount,
  bookingLabels,
  value,
  onChange,
}: Props) {
  const { data: catalog = [], isLoading } = useServices()

  const handleAdd = () => {
    if (catalog.length === 0) {
      return
    }

    const first = catalog[0]
    onChange([
      ...value,
      { service_id: first.id, name: first.name, price: first.price, qty: 1, booking_index: 0 },
    ])
  }

  const handleChange = (idx: number, patch: Partial<ServiceLineItem>) => {
    const updated = value.map((item, i) => {
      if (i !== idx) {
        return item
      }

      if (patch.service_id !== undefined) {
        const found = catalog.find((service) => service.id === patch.service_id)
        return {
          ...item,
          ...patch,
          name: found?.name ?? item.name,
          price: found?.price ?? item.price,
        }
      }

      return { ...item, ...patch }
    })

    onChange(updated)
  }

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  if (isLoading) {
    return <Spin size="small" />
  }

  const columns: ColumnsType<ServiceLineItem> = [
    {
      title: 'Dịch vụ',
      dataIndex: 'service_id',
      render: (serviceId: string, _record, idx) => (
        <Select
          value={serviceId}
          style={{ width: '100%', minWidth: 180 }}
          options={catalog.map((service) => ({
            value: service.id,
            label: `${service.name} (${VND_FORMATTER.format(service.price)})`,
          }))}
          onChange={(newServiceId) => handleChange(idx, { service_id: newServiceId })}
        />
      ),
    },
    {
      // Cho phép sửa tay đơn giá, khác giá catalog
      title: 'Đơn giá',
      dataIndex: 'price',
      width: 150,
      render: (price: number, _record, idx) => (
        <InputNumber<number>
          min={0}
          step={5000}
          value={price}
          style={{ width: '100%' }}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(v) => Number(v?.replace(/,/g, '') ?? 0)}
          addonAfter="₫"
          onChange={(newPrice) => handleChange(idx, { price: newPrice ?? 0 })}
        />
      ),
    },
    {
      title: 'SL',
      dataIndex: 'qty',
      width: 80,
      render: (qty: number, _record, idx) => (
        <InputNumber
          min={1}
          value={qty}
          style={{ width: '100%' }}
          onChange={(newQty) => handleChange(idx, { qty: newQty ?? 1 })}
        />
      ),
    },
    {
      title: 'Thành tiền',
      width: 150,
      render: (_value, row) => <Text>{VND_FORMATTER.format(row.price * row.qty)}</Text>,
    },
    ...(bookingCount > 1
      ? [
          {
            title: 'Phòng',
            dataIndex: 'booking_index',
            width: 140,
            render: (bookingIndex: number, _record: ServiceLineItem, idx: number) => (
              <Select
                value={bookingIndex}
                style={{ width: '100%' }}
                options={bookingLabels.map((label, i) => ({ value: i, label }))}
                onChange={(nextBookingIndex) => handleChange(idx, { booking_index: nextBookingIndex })}
              />
            ),
          } as const,
        ]
      : []),
    {
      title: '',
      width: 40,
      render: (_value, _record, idx) => (
        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemove(idx)} />
      ),
    },
  ]

  return (
    <div>
      {value.length === 0 ? (
        <Empty description="Chưa có dịch vụ" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '8px 0' }} />
      ) : (
        <Table
          dataSource={value}
          rowKey={(_row, i) => String(i)}
          pagination={false}
          size="small"
          style={{ marginBottom: 8 }}
          columns={columns}
        />
      )}

      <Button icon={<PlusOutlined />} onClick={handleAdd} disabled={catalog.length === 0} size="small">
        Thêm dịch vụ
      </Button>
    </div>
  )
}
