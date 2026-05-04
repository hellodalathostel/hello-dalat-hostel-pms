import { zodResolver } from '@hookform/resolvers/zod'
import dayjs, { type Dayjs } from 'dayjs'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select } from 'antd'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useCancelBooking, useUpdateBooking } from '@/hooks/useUpdateBooking'
import type { BookingRow } from '@/hooks/useBookingDetail'
import { ROOM_OPTIONS } from '@/shared/constants/rooms'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

type EditBookingModalProps = {
  booking: BookingRow | null
  onClose: () => void
  onSuccess: () => void
}

const schema = z
  .object({
    room_id: z.string().min(1, 'Chon phong'),
    check_in: z.custom<Dayjs>((v) => dayjs.isDayjs(v)),
    check_out: z.custom<Dayjs>((v) => dayjs.isDayjs(v)),
    price: z.number().min(1, 'Nhap gia'),
    guests_count: z.number().min(1),
    guest_name: z.string().optional(),
    note: z.string().optional(),
  })
  .refine((d) => d.check_out.isAfter(d.check_in), {
    message: 'Check-out phai sau check-in',
    path: ['check_out'],
  })

type FormValues = z.infer<typeof schema>

function getDefaultValues(): FormValues {
  const today = dayjs().startOf('day')

  return {
    room_id: '',
    check_in: today,
    check_out: today.add(1, 'day'),
    price: 0,
    guests_count: 1,
    guest_name: '',
    note: '',
  }
}

export function EditBookingModal({ booking, onClose, onSuccess }: EditBookingModalProps) {
  const updateMutation = useUpdateBooking()
  const cancelMutation = useCancelBooking()
  const { message } = useAppFeedback()

  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultValues(),
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!booking) {
      return
    }

    reset({
      room_id: booking.room_id,
      check_in: dayjs(booking.check_in),
      check_out: dayjs(booking.check_out),
      price: booking.price,
      guests_count: booking.guests_count,
      guest_name: booking.guest_name ?? '',
      note: booking.note ?? '',
    })
  }, [booking, reset])

  const onSubmit = async (values: FormValues) => {
    if (!booking) {
      return
    }

    try {
      await updateMutation.mutateAsync({
        bookingId: booking.id,
        roomId: values.room_id,
        checkIn: values.check_in,
        checkOut: values.check_out,
        price: values.price,
        guestsCount: values.guests_count,
        guestName: values.guest_name,
        note: values.note,
      })
      message.success('Cap nhat booking thanh cong')
      onSuccess()
    } catch {
      // Loi da duoc hook mutation xu ly bang notification.
    }
  }

  return (
    <Modal
      open={!!booking}
      title='Sua booking'
      onCancel={onClose}
      destroyOnClose
      footer={
        <>
          {booking?.status === 'booked' ? (
            <Popconfirm
              title='Xac nhan huy booking nay?'
              onConfirm={() => {
                if (!booking) {
                  return
                }

                cancelMutation.mutate(booking.id, {
                  onSuccess: () => {
                    message.success('Huy booking thanh cong')
                    onSuccess()
                  },
                })
              }}
            >
              <Button danger loading={cancelMutation.isPending}>
                Huy booking
              </Button>
            </Popconfirm>
          ) : null}

          <Button onClick={onClose}>Dong</Button>

          <Button type='primary' loading={updateMutation.isPending} onClick={handleSubmit(onSubmit)}>
            Luu thay doi
          </Button>
        </>
      }
    >
      <Form layout='vertical' onFinish={handleSubmit(onSubmit)}>
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
              <Select {...field} options={ROOM_OPTIONS} />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name='check_in'
          render={({ field, fieldState }) => (
            <Form.Item
              label='Check-in'
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
          name='check_out'
          render={({ field, fieldState }) => (
            <Form.Item
              label='Check-out'
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
          name='price'
          render={({ field, fieldState }) => (
            <Form.Item
              label='Gia phong'
              required
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <InputNumber
                value={field.value}
                onChange={(value) => field.onChange(value ?? 0)}
                min={1}
                style={{ width: '100%' }}
                formatter={(value) => {
                  if (value === undefined || value === null) {
                    return ''
                  }

                  const formatted = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                  return `${formatted} VND`
                }}
                parser={(value) => Number(String(value ?? '').replace(/[^\d.-]/g, ''))}
              />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name='guests_count'
          render={({ field, fieldState }) => (
            <Form.Item
              label='So khach'
              required
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <InputNumber
                value={field.value}
                onChange={(value) => field.onChange(value ?? 1)}
                min={1}
                precision={0}
                style={{ width: '100%' }}
              />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name='guest_name'
          render={({ field, fieldState }) => (
            <Form.Item
              label='Ten khach'
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <Input {...field} />
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
              <Input.TextArea {...field} rows={2} />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  )
}
