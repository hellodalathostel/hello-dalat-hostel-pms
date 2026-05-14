import { Checkbox, Input, InputNumber, Select, Space } from 'antd'
import type { DepositInput } from '@/features/bookings/types/booking'

interface Props {
  value: DepositInput | null
  onChange: (deposit: DepositInput | null) => void
}

const PAYMENT_METHODS: Array<{ value: DepositInput['method']; label: string }> = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'card', label: 'Thẻ (+4%)' },
  { value: 'other', label: 'Khác' },
]

export function DepositSection({ value, onChange }: Props) {
  const enabled = value !== null

  const handleToggle = (checked: boolean) => {
    onChange(checked ? { amount: 0, method: 'cash', note: '' } : null)
  }

  const handleChange = (patch: Partial<DepositInput>) => {
    if (!value) {
      return
    }

    onChange({ ...value, ...patch })
  }

  return (
    <div>
      <Checkbox checked={enabled} onChange={(event) => handleToggle(event.target.checked)}>
        Có đặt cọc
      </Checkbox>

      {enabled ? (
        <Space style={{ marginTop: 8, width: '100%' }} direction="vertical" size={8}>
          <Space wrap>
            <InputNumber
              min={0}
              step={50000}
              value={value?.amount}
              style={{ width: 180 }}
              placeholder="Số tiền cọc"
              formatter={(raw) => `${raw ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              addonAfter="đ"
              onChange={(nextAmount) => handleChange({ amount: nextAmount ?? 0 })}
            />

            <Select
              value={value?.method}
              style={{ width: 180 }}
              options={PAYMENT_METHODS}
              onChange={(method) => handleChange({ method })}
            />
          </Space>

          <Input
            value={value?.note}
            placeholder="Ghi chú (tuỳ chọn)"
            onChange={(event) => handleChange({ note: event.target.value })}
          />
        </Space>
      ) : null}
    </div>
  )
}
