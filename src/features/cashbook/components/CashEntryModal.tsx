import { Modal, Form, Select, InputNumber, Input, Alert } from 'antd'
import { useEffect } from 'react'
import { CASH_ENTRY_TYPE_OPTIONS, CASH_ENTRY_DIRECTION } from '@/constants/cashBook'
import { useAddCashEntry, useUpdateCashEntry } from '../hooks/useCashBook'
import type { CashEntryType, CashBookDetailRow } from '@/types/cashBook'

interface Props {
  open: boolean
  onClose: () => void
  /** Ngay ghi giao dich (chi dung khi them moi) */
  entryDate: string
  /** Co gia tri = che do SUA. null = che do THEM MOI */
  editingEntry?: CashBookDetailRow | null
}

interface FormValues {
  entryType: CashEntryType
  amount: number
  description: string
  note?: string
}

export function CashEntryModal({ open, onClose, entryDate, editingEntry }: Props) {
  const [form] = Form.useForm<FormValues>()
  const addEntry = useAddCashEntry()
  const updateEntry = useUpdateCashEntry()
  const entryType = Form.useWatch('entryType', form)

  const isEditing = Boolean(editingEntry)
  const isPending = addEntry.isPending || updateEntry.isPending

  // Do du lieu vao form khi mo o che do sua
  useEffect(() => {
    if (!open) {
      form.resetFields()
      return
    }
    if (editingEntry) {
      form.setFieldsValue({
        entryType: editingEntry.entry_type as CashEntryType,
        amount: editingEntry.amount,
        description: editingEntry.description ?? '',
      })
    }
  }, [open, editingEntry, form])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    if (editingEntry) {
      await updateEntry.mutateAsync({ entryId: editingEntry.ref_id, ...values })
    } else {
      await addEntry.mutateAsync({ ...values, entryDate })
    }
    onClose()
  }

  const direction = entryType ? CASH_ENTRY_DIRECTION[entryType] : null

  return (
    <Modal
      open={open}
      title={isEditing ? 'Sửa giao dịch' : 'Thêm giao dịch sổ quỹ'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={isEditing ? 'Lưu thay đổi' : 'Ghi sổ'}
      cancelText="Huỷ"
      confirmLoading={isPending}
      width="min(520px, 92vw)"
    >
      {!isEditing && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Thu khách và chi phí đã tự động vào sổ. Chỉ ghi tay các khoản chưa có trong hệ thống."
        />
      )}

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="entryType"
          label="Loại giao dịch"
          rules={[{ required: true, message: 'Chọn loại giao dịch' }]}
        >
          <Select options={CASH_ENTRY_TYPE_OPTIONS} placeholder="Chọn loại" size="large" />
        </Form.Item>

        {direction && (
          <Alert
            type={direction === 'in' ? 'success' : 'warning'}
            showIcon
            style={{ marginBottom: 16 }}
            message={direction === 'in' ? 'Tiền VÀO két' : 'Tiền RA khỏi két'}
          />
        )}

        <Form.Item
          name="amount"
          label="Số tiền (₫)"
          rules={[
            { required: true, message: 'Nhập số tiền' },
            { type: 'number', min: 1, message: 'Số tiền phải lớn hơn 0' },
          ]}
        >
          <InputNumber<number>
            style={{ width: '100%' }}
            size="large"
            min={1}
            step={1000}
            inputMode="numeric"
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
            parser={(v) => Number((v ?? '').replace(/\./g, ''))}
            placeholder="0"
          />
        </Form.Item>

        <Form.Item
          name="description"
          label="Nội dung"
          rules={[{ required: true, message: 'Nhập nội dung giao dịch' }]}
        >
          <Input size="large" placeholder="VD: Mua nước rửa chén" maxLength={200} />
        </Form.Item>

        <Form.Item name="note" label="Ghi chú (không bắt buộc)">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
