import { Modal, Form, InputNumber, Input, Statistic, Row, Col, Alert } from 'antd'
import { useEffect } from 'react'
import { formatVnd } from '@/constants/cashBook'
import { useCloseCashShift } from '../hooks/useCashBook'

interface Props {
  open: boolean
  onClose: () => void
  shiftDate: string
  /** Ton quy he thong tinh ra, de doi chieu */
  expectedBalance: number
}

interface FormValues {
  countedBalance: number
  note?: string
}

export function CloseShiftModal({ open, onClose, shiftDate, expectedBalance }: Props) {
  const [form] = Form.useForm<FormValues>()
  const closeShift = useCloseCashShift()
  const counted = Form.useWatch('countedBalance', form)

  useEffect(() => {
    if (!open) form.resetFields()
  }, [open, form])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    await closeShift.mutateAsync({ shiftDate, ...values })
    onClose()
  }

  // Chenh lech tinh tam de thay ngay khi go — DB van la nguon chinh thuc
  const diff = typeof counted === 'number' ? counted - expectedBalance : null

  return (
    <Modal
      open={open}
      title={`Chốt ca ngày ${shiftDate}`}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Chốt ca"
      cancelText="Huỷ"
      confirmLoading={closeShift.isPending}
      width="min(520px, 92vw)"
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Sau khi chốt ca sẽ không thêm/sửa được giao dịch cho ngày này. Cần sửa thì phải mở lại ca."
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Statistic
            title="Sổ sách tính ra"
            value={expectedBalance}
            formatter={(v) => formatVnd(Number(v))}
            suffix="₫"
          />
        </Col>
        <Col span={12}>
          {diff !== null && (
            <Statistic
              title={diff === 0 ? 'Khớp' : diff > 0 ? 'Thừa' : 'Thiếu'}
              value={Math.abs(diff)}
              formatter={(v) => formatVnd(Number(v))}
              suffix="₫"
              valueStyle={{ color: diff === 0 ? '#3f8600' : '#cf1322' }}
            />
          )}
        </Col>
      </Row>

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="countedBalance"
          label="Số tiền đếm được trong két (₫)"
          rules={[
            { required: true, message: 'Nhập số tiền đếm được' },
            { type: 'number', min: 0, message: 'Số tiền không thể âm' },
          ]}
        >
          <InputNumber<number>
            style={{ width: '100%' }}
            size="large"
            min={0}
            step={1000}
            inputMode="numeric"
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
            parser={(v) => Number((v ?? '').replace(/\./g, ''))}
            placeholder="0"
            autoFocus
          />
        </Form.Item>

        <Form.Item
          name="note"
          label={diff !== null && diff !== 0 ? 'Lý do chênh lệch (nên ghi)' : 'Ghi chú'}
        >
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
