import { Modal, Form, Input, Alert, Typography } from 'antd'
import { useEffect } from 'react'
import { formatVnd, getCashEntryLabel } from '@/constants/cashBook'
import { useVoidCashEntry } from '../hooks/useCashBook'
import type { CashBookDetailRow } from '@/types/cashBook'

const { Text } = Typography

interface Props {
  open: boolean
  onClose: () => void
  entry: CashBookDetailRow | null
}

export function VoidEntryModal({ open, onClose, entry }: Props) {
  const [form] = Form.useForm<{ reason: string }>()
  const voidEntry = useVoidCashEntry()

  useEffect(() => {
    if (!open) form.resetFields()
  }, [open, form])

  const handleSubmit = async () => {
    if (!entry) return
    const { reason } = await form.validateFields()
    await voidEntry.mutateAsync({ entryId: entry.ref_id, reason })
    onClose()
  }

  return (
    <Modal
      open={open}
      title="Huỷ giao dịch"
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Huỷ giao dịch"
      okButtonProps={{ danger: true }}
      cancelText="Quay lại"
      confirmLoading={voidEntry.isPending}
      width="min(480px, 92vw)"
    >
      {entry && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <>
              <Text strong>{entry.description}</Text>
              <br />
              <Text type="secondary">
                {getCashEntryLabel(entry.entry_type)} ·{' '}
                {entry.direction === 'in' ? '+' : '−'}
                {formatVnd(entry.amount)}₫
              </Text>
            </>
          }
          description="Giao dịch sẽ bị loại khỏi sổ quỹ nhưng vẫn lưu dấu vết."
        />
      )}

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="reason"
          label="Lý do huỷ"
          rules={[{ required: true, message: 'Bắt buộc ghi lý do huỷ' }]}
        >
          <Input.TextArea rows={3} maxLength={500} placeholder="VD: Ghi nhầm số tiền" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  )
}
