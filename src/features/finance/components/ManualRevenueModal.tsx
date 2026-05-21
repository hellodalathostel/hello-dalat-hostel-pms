import { useEffect } from 'react'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import {
  SOURCE_LABELS,
  useCreateManualRevenue,
  type CreateManualRevenuePayload,
  type ManualRevenueSource,
} from '../hooks/useManualRevenue'

interface Props {
  open: boolean
  onClose: () => void
}

interface FormValues {
  period: dayjs.Dayjs
  source: ManualRevenueSource
  amount: number
  note?: string
}

export function ManualRevenueModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { toast } = useAppFeedback()
  const { mutateAsync: createRevenue, isPending } = useCreateManualRevenue()

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldValue('period', dayjs())
    }
  }, [open, form])

  const handleSubmit = async (values: FormValues) => {
    const payload: CreateManualRevenuePayload = {
      period: values.period.format('YYYY-MM-DD'),
      source: values.source,
      amount: values.amount,
      note: values.note?.trim() || undefined,
    }

    try {
      await createRevenue(payload)
      toast.success('Đã nhập doanh thu thủ công')
      onClose()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định'
      toast.error(`Nhập thất bại: ${message}`)
    }
  }

  return (
    <Modal
      title={
        <Space>
          <PlusOutlined />
          Nhập doanh thu thủ công
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={440}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="period"
          label="Ngày phát sinh"
          rules={[{ required: true, message: 'Vui lòng chọn ngày' }]}
        >
          <DatePicker
            format="DD/MM/YYYY"
            style={{ width: '100%' }}
            disabledDate={(date) => date.isAfter(dayjs(), 'day')}
          />
        </Form.Item>

        <Form.Item
          name="source"
          label="Loại"
          rules={[{ required: true, message: 'Vui lòng chọn loại' }]}
        >
          <Select placeholder="Chọn loại doanh thu">
            {(Object.entries(SOURCE_LABELS) as [ManualRevenueSource, string][]).map(
              ([value, label]) => (
                <Select.Option key={value} value={value}>
                  {label}
                </Select.Option>
              ),
            )}
          </Select>
        </Form.Item>

        <Form.Item
          name="amount"
          label="Số tiền (VNĐ)"
          rules={[
            { required: true, message: 'Vui lòng nhập số tiền' },
            { type: 'number', min: 1000, message: 'Tối thiểu 1.000đ' },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => (value ? value.replace(/,/g, '') : '')}
            placeholder="0"
            min={1000}
            step={10000}
          />
        </Form.Item>

        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea
            rows={2}
            placeholder="Tuỳ chọn — VD: khách đặt thêm tour, v.v."
            maxLength={200}
            showCount
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onClose} disabled={isPending}>
              Huỷ
            </Button>
            <Button type="primary" htmlType="submit" loading={isPending}>
              Lưu
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  )
}