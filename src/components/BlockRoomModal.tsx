import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, DatePicker, Form, Input, Modal, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  BLOCK_REASON_LABELS,
  type BlockReason,
  useCreateBlock,
} from '@/hooks/useRoomBlocks'
import { ROOM_OPTIONS } from '@/shared/constants/rooms'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

export interface BlockRoomModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  prefillRoomId?: string
  prefillDate?: string
}

const schema = z
  .object({
    room_id: z.string().min(1, 'Chon phong'),
    start_date: z.custom<Dayjs>((v) => dayjs.isDayjs(v)),
    end_date: z.custom<Dayjs>((v) => dayjs.isDayjs(v)),
    reason: z.enum(['maintenance', 'owner_use', 'ota_closed', 'deep_cleaning', 'other']),
    note: z.string().optional(),
  })
  .refine((d) => d.end_date.isAfter(d.start_date) || d.end_date.isSame(d.start_date), {
    message: 'Ngay ket thuc phai bang hoac sau ngay bat dau',
    path: ['end_date'],
  })

const REASO_OPTIONS = Object.entries(BLOCK_REASON_LABELS).map(([value, label]) => ({
  value: value as BlockReason,
  label,
}))

type BlockRoomFormValues = z.infer<typeof schema>

export function BlockRoomModal({
  open,
  onClose,
  onSuccess,
  prefillRoomId,
  prefillDate,
}: BlockRoomModalProps) {
  const createBlockMutation = useCreateBlock()
  const { message } = useAppFeedback()

  const { control, handleSubmit, reset } = useForm<BlockRoomFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      room_id: '',
      start_date: dayjs(),
      end_date: dayjs().add(1, 'day'),
      reason: 'maintenance',
      note: '',
    },
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!open) {
      return
    }

    reset({
      room_id: prefillRoomId ?? '',
      start_date: prefillDate ? dayjs(prefillDate) : dayjs(),
      end_date: prefillDate ? dayjs(prefillDate).add(1, 'day') : dayjs().add(1, 'day'),
      reason: 'maintenance',
      note: '',
    })
  }, [open, prefillRoomId, prefillDate, reset])

  const onSubmit = async (values: BlockRoomFormValues) => {
    await createBlockMutation.mutateAsync({
      roomId: values.room_id,
      startDate: values.start_date,
      endDate: values.end_date,
      reason: values.reason,
      note: values.note,
    })
    message.success('Block phong thanh cong')
    onSuccess()
  }

  return (
    <Modal
      open={open}
      title='Block phong thu cong'
      onCancel={onClose}
      destroyOnClose
      footer={
        <>
          <Button onClick={onClose}>Dong</Button>
          <Button
            type='primary'
            htmlType='submit'
            loading={createBlockMutation.isPending}
            form='block-room-form'
          >
            Block phong
          </Button>
        </>
      }
    >
      <Alert
        type='info'
        message='Ngay ket thuc la ngay cuoi cung bi block (inclusive).'
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form id='block-room-form' layout='vertical' onFinish={handleSubmit(onSubmit)}>
        <Controller
          control={control}
          name='room_id'
          render={({ field, fieldState }) => (
            <Form.Item
              label='Phong'
              required
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <Select {...field} options={ROOM_OPTIONS} placeholder='Chon phong' />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name='start_date'
          render={({ field, fieldState }) => (
            <Form.Item
              label='Thanh gioi thien'
              required
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <DatePicker
                value={field.value}
                onChange={(value) => field.onChange(value)}
                format='DD/MM/YYYY'
                style={{ width: '100%' }}
              />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name='end_date'
          render={({ field, fieldState }) => (
            <Form.Item
              label='Thanh gioi kuet thuc'
              required
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <DatePicker
                value={field.value}
                onChange={(value) => field.onChange(value)}
                format='DD/MM/YYYY'
                style={{ width: '100%' }}
              />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name='reason'
          render={({ field, fieldState }) => (
            <Form.Item
              label='Ly do'
              required
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <Select {...field} options={REASO_OPTIONS} />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name='note'
          render={({ field, fieldState }) => (
            <Form.Item
              label='Ghi chu'
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <Input.TextArea {...field} rows={2} placeholder='Ghi chu them (neu co)' />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  )
}
