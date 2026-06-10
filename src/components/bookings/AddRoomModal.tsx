import React, { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Spin } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { supabase } from '@/api/supabase'
import { useAddRoomToGroup } from '@/hooks/useAddRoomToGroup'

const schema = z.object({
  room_id: z.string().min(1, 'Chọn phòng'),
  check_in: z.custom<Dayjs>((value) => dayjs.isDayjs(value), 'Chọn ngày nhận'),
  check_out: z.custom<Dayjs>((value) => dayjs.isDayjs(value), 'Chọn ngày trả'),
  price_per_night: z.number({ invalid_type_error: 'Nhập giá' }).min(0),
  guests_count: z.number().min(1).default(1),
  note: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  groupId: string
  defaultCheckIn?: string
  defaultCheckOut?: string
  onClose: () => void
}

export function AddRoomModal({ open, groupId, defaultCheckIn, defaultCheckOut, onClose }: Props) {
  const { mutate: addRoom, isPending } = useAddRoomToGroup()

  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ['rooms-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name')
        .eq('is_active', true)
        .order('id')

      if (error) {
        throw error
      }

      return data as { id: string; name: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { guests_count: 1, price_per_night: 0 },
  })

  useEffect(() => {
    if (open) {
      reset({
        room_id: undefined,
        check_in: defaultCheckIn ? dayjs(defaultCheckIn) : undefined,
        check_out: defaultCheckOut ? dayjs(defaultCheckOut) : undefined,
        price_per_night: 0,
        guests_count: 1,
        note: '',
      })
    }
  }, [defaultCheckIn, defaultCheckOut, open, reset])

  const watchRoomId = watch('room_id')
  const watchCheckIn = watch('check_in') as Dayjs | undefined

  useEffect(() => {
    if (!watchRoomId || !watchCheckIn) {
      return
    }

    void supabase
      .rpc('get_suggested_price', {
        p_room_id: watchRoomId,
        p_date: watchCheckIn.format('YYYY-MM-DD'),
      })
      .then(({ data }) => {
        if (typeof data === 'number' && data > 0) {
          setValue('price_per_night', data)
        }
      })
  }, [setValue, watchCheckIn, watchRoomId])

  const onSubmit = (values: FormValues) => {
    addRoom(
      {
        group_id: groupId,
        room_id: values.room_id,
        check_in: (values.check_in as Dayjs).format('YYYY-MM-DD'),
        check_out: (values.check_out as Dayjs).format('YYYY-MM-DD'),
        price_per_night: values.price_per_night,
        guests_count: values.guests_count,
        note: values.note,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      title="Thêm phòng"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit(onSubmit)}
      okText="Thêm phòng"
      cancelText="Hủy"
      confirmLoading={isPending}
      destroyOnClose
    >
      <Spin spinning={roomsLoading}>
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Phòng"
            validateStatus={errors.room_id ? 'error' : ''}
            help={errors.room_id?.message}
            required
          >
            <Controller
              name="room_id"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  placeholder="Chọn phòng"
                  options={rooms.map((room) => ({ value: room.id, label: `${room.id} — ${room.name}` }))}
                  showSearch
                  optionFilterProp="label"
                />
              )}
            />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Nhận phòng"
                validateStatus={errors.check_in ? 'error' : ''}
                help={errors.check_in?.message as string}
                required
              >
                <Controller
                  name="check_in"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      {...field}
                      style={{ width: '100%' }}
                      format="DD/MM/YYYY"
                      placeholder="Ngày nhận"
                    />
                  )}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Trả phòng"
                validateStatus={errors.check_out ? 'error' : ''}
                help={errors.check_out?.message as string}
                required
              >
                <Controller
                  name="check_out"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      {...field}
                      style={{ width: '100%' }}
                      format="DD/MM/YYYY"
                      placeholder="Ngày trả"
                      disabledDate={(current) =>
                        watchCheckIn ? current.isBefore(watchCheckIn.add(1, 'day'), 'day') : false
                      }
                    />
                  )}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Giá/đêm (VND)"
                validateStatus={errors.price_per_night ? 'error' : ''}
                help={errors.price_per_night?.message}
                required
              >
                <Controller
                  name="price_per_night"
                  control={control}
                  render={({ field }) => (
                    <InputNumber
                      {...field}
                      style={{ width: '100%' }}
                      formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(value) => Number(value?.replace(/,/g, '') ?? 0)}
                      min={0}
                      step={50000}
                    />
                  )}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Số khách">
                <Controller
                  name="guests_count"
                  control={control}
                  render={({ field }) => (
                    <InputNumber {...field} style={{ width: '100%' }} min={1} max={20} />
                  )}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Ghi chú">
            <Controller
              name="note"
              control={control}
              render={({ field }) => (
                <Input.TextArea {...field} rows={2} placeholder="Ghi chú cho phòng này (tùy chọn)" />
              )}
            />
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  )
}
