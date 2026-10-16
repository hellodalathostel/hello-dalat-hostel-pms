import { zodResolver } from '@hookform/resolvers/zod'
import dayjs, { type Dayjs } from 'dayjs'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select } from 'antd'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useCancelBooking, useUpdateBooking } from '@/features/bookings/hooks/useUpdateBooking'
import type { BookingRow } from '@/features/bookings/hooks/useBookingDetail'
import { useRooms } from '@/features/bookings/hooks/useRooms'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { formatRoomLabel } from '@/shared/utils/format'

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
    price_per_night: z.number().min(1, 'Nhap gia'),
    // U-04: cho phép null khi ô trống — không tự ép về 1, hiện lỗi cạnh ô
    guests_count: z
      .number()
      .nullable()
      .refine((v) => v != null && v >= 1, 'Số khách phải từ 1 trở lên'),
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
    price_per_night: 0,
    guests_count: 1,
    guest_name: '',
    note: '',
  }
}

export function EditBookingModal({ booking, onClose, onSuccess }: EditBookingModalProps) {
  const updateMutation = useUpdateBooking()
  const cancelMutation = useCancelBooking()
  const { message, modal } = useAppFeedback()
  const { data: rooms = [], isLoading: roomsLoading } = useRooms()

  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultValues(),
    mode: 'onSubmit',
  })

  // U-04: kiểm tra sức chứa phòng ngay khi nhập — giữ nguyên giá trị, chỉ báo lỗi + khoá nút lưu
  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() không tương thích React Compiler, known issue
  const watchedRoomId = watch('room_id')
  const watchedGuests = watch('guests_count')
  const selectedRoomCapacity = rooms.find((r) => r.id === watchedRoomId)?.capacity ?? null
  const guestsError =
    watchedGuests == null || watchedGuests < 1
      ? 'Số khách phải từ 1 trở lên'
      : selectedRoomCapacity && watchedGuests > selectedRoomCapacity
        ? `Phòng này tối đa ${selectedRoomCapacity} khách`
        : null

  useEffect(() => {
    if (!booking) {
      return
    }

    reset({
      room_id: booking.room_id,
      check_in: dayjs(booking.check_in),
      check_out: dayjs(booking.check_out),
      price_per_night: booking.price_per_night,
      guests_count: booking.guests_count,
      guest_name: booking.guest_name ?? '',
      note: booking.note ?? '',
    })
  }, [booking, reset])

  const onSubmit = async (values: FormValues) => {
    if (!booking) return
    if (guestsError) {
      message.error(guestsError)
      return
    }

    const doUpdate = async (override: boolean) => {
      try {
        await updateMutation.mutateAsync({
          bookingId: booking.id,
          roomId: values.room_id,
          checkIn: values.check_in,
          checkOut: values.check_out,
          pricePerNight: values.price_per_night,
          guestsCount: values.guests_count ?? undefined,
          guestName: values.guest_name,
          note: values.note,
          overrideCheckin: override,
        })
        message.success('Cap nhat booking thanh cong')
        onSuccess()
      } catch {
        // Loi da duoc hook mutation xu ly bang notification.
      }
    }

    // Flow A: booking checked-in -> confirm truoc khi override
    if (booking.status === 'checked-in') {
      modal.confirm({
        title: 'Xac nhan chinh sua booking dang Dang o',
        content: 'Booking nay dang check-in. Ban co chac muon luu thay doi?',
        okText: 'Xac nhan luu',
        cancelText: 'Huy',
        okButtonProps: { danger: true },
        onOk: () => doUpdate(true),
      })
      return
    }

    await doUpdate(false)
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

          <Button
            type='primary'
            loading={updateMutation.isPending}
            disabled={Boolean(guestsError)}
            onClick={handleSubmit(onSubmit)}
          >
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
              label='Phòng'
              required
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <Select
                {...field}
                // U-03: "301 — Standard Double — tối đa 2 khách" cả trong danh sách lẫn giá trị đã chọn
                options={rooms.map((r) => ({ value: r.id, label: formatRoomLabel(r) }))}
                showSearch
                optionFilterProp='label'
                loading={roomsLoading}
              />
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
          name='price_per_night'
          render={({ field, fieldState }) => (
            <Form.Item
              label='Giá/đêm'
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
              label='Số khách'
              required
              validateStatus={guestsError || fieldState.error ? 'error' : ''}
              help={guestsError ?? fieldState.error?.message}
            >
              <InputNumber
                value={field.value}
                onChange={(value) => field.onChange(value ?? null)}
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
              label='Tên khách'
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
              label='Ghi chú'
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
