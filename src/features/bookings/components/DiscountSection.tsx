import { Button, Empty, Input, InputNumber, Select, Table } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { DiscountLineItem } from '@/features/bookings/types/booking'

interface Props {
  bookingCount: number
  bookingLabels: string[]
  value: DiscountLineItem[]
  onChange: (items: DiscountLineItem[]) => void
}

export function DiscountSection({
  bookingCount,
  bookingLabels,
  value,
  onChange,
}: Props) {
  const handleAdd = () => {
    onChange([...value, { amount: 0, description: '', booking_index: 0 }])
  }

  const handleChange = (idx: number, patch: Partial<DiscountLineItem>) => {
    onChange(value.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  const columns: ColumnsType<DiscountLineItem> = [
    {
      title: 'Số tiền giảm',
      dataIndex: 'amount',
      render: (amount: number, _record, idx) => (
        <InputNumber
          min={0}
          step={10000}
          value={amount}
          style={{ width: '100%' }}
          formatter={(raw) => `${raw ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          addonAfter="đ"
          onChange={(nextAmount) => handleChange(idx, { amount: nextAmount ?? 0 })}
        />
      ),
    },
    {
      title: 'Lý do',
      dataIndex: 'description',
      render: (description: string, _record, idx) => (
        <Input
          value={description}
          placeholder="VD: Khách quen, trả sớm..."
          onChange={(event) => handleChange(idx, { description: event.target.value })}
        />
      ),
    },
    ...(bookingCount > 1
      ? [
          {
            title: 'Phòng',
            dataIndex: 'booking_index',
            width: 140,
            render: (bookingIndex: number, _record: DiscountLineItem, idx: number) => (
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
        <Empty description="Chưa có giảm giá" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '8px 0' }} />
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

      <Button icon={<PlusOutlined />} onClick={handleAdd} size="small">
        Thêm giảm giá
      </Button>
    </div>
  )
}
