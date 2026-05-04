import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import type { JSX } from 'react'
import { z } from 'zod'
import { Button, DatePicker, Form, Input, Modal, Select } from 'antd'
import type { BlockReason } from '@/hooks/useRoomBlocks'
import { useCreateBlock } from '@/hooks/useRoomBlocks'

type DateRange = [Dayjs, Dayjs]

interface BlockRoomModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  initialRoomId?: string
  initialDate?: string
}

interface BlockRoomFormValues {
  room_id: string
  date_range: DateRange
  reason: BlockReason
  note: string
}

const blockRoomSchema = z.object({
  room_id: z.string().min(1, 'Vui lòng chọn phòng'),
  date_range: z
    .tuple([
      z.custom<Dayjs>((value) => dayjs.isDayjs(value) && value.isValid(), 'Ngày bắt đầu không hợp lệ'),
      z.custom<Dayjs>((value) => dayjs.isDayjs(value) && value.isValid(), 'Ngày kết thúc không hợp lệ'),
    ])
    .refine(([startDate, endDate]) => !endDate.isBefore(startDate, 'day'), {
      message: 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu',
      path: [1],
    }),
  reason: z.enum(['maintenance', 'owner_use', 'ota_closed', 'deep_cleaning', 'other'], {
    message: 'Vui lòng chọn lý do khóa phòng',
  }),
  note: z.string().max(1000, 'Ghi chú không vượt quá 1000 ký tự').optional().default(''),
})

const roomOptions = [
  { label: 'Phòng 101', value: '101' },
  { label: 'Phòng 102', value: '102' },
  { label: 'Phòng 103', value: '103' },
  { label: 'Phòng 104', value: '104' },
  { label: 'Phòng 201', value: '201' },
  { label: 'Phòng 202', value: '202' },
  { label: 'Phòng 301', value: '301' },
  { label: 'Phòng 302', value: '302' },
]

const reasonOptions: Array<{ label: string; value: BlockReason }> = [
  { label: 'Bảo trì', value: 'maintenance' },
  { label: 'Chủ nhà sử dụng', value: 'owner_use' },
  { label: 'Đóng OTA', value: 'ota_closed' },
  { label: 'Dọn vệ sinh sâu', value: 'deep_cleaning' },
  { label: 'Khác', value: 'other' },
]

function mapZodIssuePathToFieldName(path: readonly (string | number | symbol)[]): keyof BlockRoomFormValues {
  const firstSegment = path[0]

  if (firstSegment === 'room_id') {
    return 'room_id'
  }

  if (firstSegment === 'reason') {
    return 'reason'
  }

  if (firstSegment === 'note') {
    return 'note'
  }

  return 'date_range'
}

// Modal khóa phòng với validate Zod trước khi gọi mutation tạo block.
export function BlockRoomModal({
  open,
  onClose,
  onSuccess,
  initialRoomId,
  initialDate,
}: BlockRoomModalProps): JSX.Element {
  const [form] = Form.useForm<BlockRoomFormValues>()
  const createBlockMutation = useCreateBlock()

  const initialDay = initialDate ? dayjs(initialDate).startOf('day') : dayjs().startOf('day')

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const parsed = blockRoomSchema.safeParse(values)

      if (!parsed.success) {
        form.setFields(
          parsed.error.issues.map((issue) => ({
            name: mapZodIssuePathToFieldName(issue.path),
            errors: [issue.message],
          })),
        )
        return
      }

      const [startDate, endDate] = parsed.data.date_range

      await createBlockMutation.mutateAsync({
        roomId: parsed.data.room_id,
        startDate: startDate,
        endDate: endDate,
        reason: parsed.data.reason,
        note: parsed.data.note ?? '',
      })

      form.resetFields()
      onSuccess?.()
      onClose()
    } catch {
      // Lỗi đã được xử lý bởi AntD validation hoặc mutation hook.
    }
  }

  return (
    <Modal
      open={open}
      title="Khóa phòng"
      onCancel={onClose}
      destroyOnClose
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" danger onClick={handleSubmit} loading={createBlockMutation.isPending}>
            Khóa phòng
          </Button>
        </>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          room_id: initialRoomId ?? '',
          date_range: [initialDay, initialDay] as DateRange,
          reason: 'maintenance',
          note: '',
        }}
      >
        <Form.Item
          label="Chọn phòng"
          name="room_id"
          rules={[{ required: true, message: 'Vui lòng chọn phòng' }]}
        >
          <Select options={roomOptions} placeholder="Chọn phòng cần khóa" />
        </Form.Item>

        <Form.Item
          label="Chọn ngày"
          name="date_range"
          rules={[{ required: true, message: 'Vui lòng chọn khoảng ngày khóa' }]}
        >
          <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" allowClear={false} />
        </Form.Item>

        <Form.Item
          label="Lý do"
          name="reason"
          rules={[{ required: true, message: 'Vui lòng chọn lý do khóa phòng' }]}
        >
          <Select options={reasonOptions} placeholder="Chọn lý do" />
        </Form.Item>

        <Form.Item label="Ghi chú" name="note">
          <Input.TextArea rows={4} placeholder="Mô tả thêm về lịch khóa phòng" maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  )
}