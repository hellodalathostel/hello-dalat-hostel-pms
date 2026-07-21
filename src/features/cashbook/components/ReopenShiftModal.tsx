import { Modal, Form, Input, Alert } from 'antd'
import { useEffect } from 'react'
import { useReopenCashShift } from '../hooks/useCashBook'

interface Props {
  open: boolean
  onClose: () => void
  shiftDate: string
}

export function ReopenShiftModal({ open, onClose, shiftDate }: Props) {
  const [form] = Form.useForm<{ reason: string }>()
  const reopenShift = useReopenCashShift()

  useEffect(() => {
    if (!open) form.resetFields()
  }, [open, form])

  const handleSubmit = async () => {
    const { reason } = await form.validateFields()
    await reopenShift.mutateAsync({ shiftDate, reason })
    onClose()
  }

  return (
    <Modal
      open={open}
      title={`Mở lại ca ngày ${shiftDate}`}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Mở lại ca"
      cancelText="Quay lại"
      confirmLoading={reopenShift.isPending}
      width="min(480px, 92vw)"
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Số đếm được và chênh lệch của ca này sẽ bị xoá."
        description="Nếu có ca ngày sau đã chốt, phải mở lại các ca đó trước (từ ngày mới nhất)."
      />

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="reason"
          label="Lý do mở lại"
          rules={[{ required: true, message: 'Bắt buộc ghi lý do' }]}
        >
          <Input.TextArea rows={3} maxLength={500} placeholder="VD: Ghi sót khoản chi vặt" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  )
}
