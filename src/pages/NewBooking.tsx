import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useFieldArray, useForm, Controller } from 'react-hook-form'
import dayjs from 'dayjs'
import { useEffect, useMemo } from 'react'
import type { JSX } from 'react'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { newBookingSchema } from '@/lib/schemas'
import type { NewBookingFormValues } from '@/lib/schemas'
import { useCreateBooking } from '@/hooks/useCreateBooking'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { ROOM_OPTIONS, ROOM_CAPACITY_BY_ID } from '@/shared/constants/rooms'
import BookingImportPDF, { type ParsedBookingData } from '@/components/booking/BookingImportPDF'

const sourceOptions: Array<{ label: NewBookingFormValues['source']; value: NewBookingFormValues['source'] }> = [
  { label: 'Booking.com', value: 'Booking.com' },
  { label: 'Facebook', value: 'Facebook' },
  { label: 'Gọi điện/Zalo', value: 'Gọi điện/Zalo' },
  { label: 'Khách quen', value: 'Khách quen' },
  { label: 'Walk-in', value: 'Walk-in' },
  { label: 'Other', value: 'Other' },
]

const DEFAULT_FEE_RATES: Record<NewBookingFormValues['source'], number> = {
  'Booking.com': 0.17,
  Facebook: 0,
  'Gọi điện/Zalo': 0,
  'Khách quen': 0,
  'Walk-in': 0,
  Other: 0,
}

function getDefaultValues(prefillRoomId?: string, prefillCheckIn?: string): NewBookingFormValues {
  const parsedCheckIn = prefillCheckIn ? dayjs(prefillCheckIn).startOf('day') : dayjs().startOf('day')
  const checkInDate = parsedCheckIn.isValid() ? parsedCheckIn : dayjs().startOf('day')

  return {
    customer_name: '',
    customer_phone: '',
    customer_note: '',
    customer_cccd: '',
    source: 'Walk-in',
    channel_fee_rate: DEFAULT_FEE_RATES['Walk-in'],
    bookings: [
      {
        room_id: prefillRoomId ?? '',
        check_in: checkInDate,
        check_out: checkInDate.add(1, 'day'),
        price_per_night: 0,
        guest_name: '',
        guests_count: 1,
        note: '',
        surcharge: 0,
      },
    ],
  }
}

// Trang tạo group & booking mới theo luồng transaction RPC của Supabase.
export default function NewBooking(): JSX.Element {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { message } = useAppFeedback()
  const createBookingMutation = useCreateBooking()

  const prefilledRoomId = searchParams.get('roomId') ?? undefined
  const prefilledCheckIn = searchParams.get('checkIn') ?? undefined

  const defaultValues = useMemo(
    () => getDefaultValues(prefilledRoomId, prefilledCheckIn),
    [prefilledRoomId, prefilledCheckIn],
  )

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NewBookingFormValues>({
    resolver: zodResolver(newBookingSchema),
    defaultValues,
    mode: 'onSubmit',
  })

  useEffect(() => {
    reset(defaultValues)
  }, [defaultValues, reset])

  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() không tương thích React Compiler, known issue
  const selectedSource = watch('source')

  useEffect(() => {
    setValue('channel_fee_rate', DEFAULT_FEE_RATES[selectedSource] ?? 0, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }, [selectedSource, setValue])

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'bookings',
  })

  const applyImportedBooking = (data: ParsedBookingData) => {
    if (!data.checkIn || !data.checkOut || !data.guestName) {
      message.error('Dữ liệu PDF không đủ (thiếu ngày hoặc tên khách)')
      return
    }

    const checkIn = dayjs(data.checkIn)
    const checkOut = dayjs(data.checkOut)
    const noteParts: string[] = []

    if (data.mealPlan) noteParts.push(`Meal: ${data.mealPlan}`)
    if (data.roomNumber) noteParts.push(`Phòng: ${data.roomNumber}`)

    const mappedBooking = {
      room_id: data.roomNumber ?? '',
      check_in: checkIn,
      check_out: checkOut,
      price_per_night: data.grandTotal ?? 0,
      guest_name: data.guestName,
      guests_count: Math.max(1, data.numGuests ?? 1),
      note: noteParts.join(' | '),
      surcharge: 0,
    }

    setValue('source', 'Booking.com', { shouldDirty: true })
    setValue('customer_name', data.guestName, { shouldDirty: true })
    replace([mappedBooking])

    message.success('Đã import dữ liệu booking từ PDF.')
  }

  const handleAddBooking = () => {
    append({
      room_id: '',
      check_in: dayjs().startOf('day'),
      check_out: dayjs().add(1, 'day').startOf('day'),
      price_per_night: 0,
      guest_name: '',
      guests_count: 1,
      note: '',
      surcharge: 0,
    })
  }

  const onSubmit = async (values: NewBookingFormValues) => {
    const feeRate = values.channel_fee_rate ?? DEFAULT_FEE_RATES[values.source] ?? 0

    try {
      await createBookingMutation.mutateAsync({
        ...values,
        channel_fee_rate: feeRate,
      })
      message.success('Tạo booking thành công')
      reset(getDefaultValues())
      navigate('/dashboard')
    } catch {
      // Lỗi đã được hook mutation xử lý bằng notification.
    }
  }

  return (
    <div className="page-grid">
      <Typography.Title level={2} style={{ margin: 0 }}>
        Tạo Group & Booking mới
      </Typography.Title>

      <Form layout="vertical" onFinish={handleSubmit(onSubmit)}>
        <Row gutter={[16, 16]} align="top">
          <Col xs={24} xl={10}>
            <Card title="Thông tin khách hàng">
              <Controller
                control={control}
                name="customer_name"
                render={({ field, fieldState }) => (
                  <Form.Item
                    label="Tên khách hàng"
                    required
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={fieldState.error?.message}
                  >
                    <Input {...field} placeholder="Nguyễn Văn A" />
                  </Form.Item>
                )}
              />

              <Controller
                control={control}
                name="customer_phone"
                render={({ field, fieldState }) => (
                  <Form.Item
                    label="Số điện thoại"
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={fieldState.error?.message}
                  >
                    <Input {...field} placeholder="0901234567" />
                  </Form.Item>
                )}
              />

              <Controller
                control={control}
                name="customer_cccd"
                render={({ field, fieldState }) => (
                  <Form.Item
                    label="CCCD"
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={fieldState.error?.message}
                  >
                    <Input {...field} placeholder="0790********" />
                  </Form.Item>
                )}
              />

              <Controller
                control={control}
                name="source"
                render={({ field, fieldState }) => (
                  <Form.Item
                    label="Nguồn khách"
                    required
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={fieldState.error?.message}
                  >
                    <Select {...field} options={sourceOptions} />
                  </Form.Item>
                )}
              />

              <Controller
                control={control}
                name="channel_fee_rate"
                render={({ field, fieldState }) => (
                  <Form.Item
                    label="Phí kênh"
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={fieldState.error?.message}
                  >
                    <InputNumber
                      value={field.value}
                      onChange={(value) => field.onChange(value ?? 0)}
                      min={0}
                      max={1}
                      step={0.01}
                      precision={3}
                      style={{ width: '100%' }}
                      formatter={(value) => {
                        if (value === undefined || value === null) {
                          return ''
                        }

                        return `${(Number(value) * 100).toFixed(1)}%`
                      }}
                      parser={(value) => Number(String(value ?? '').replace(/[^\d.-]/g, '')) / 100}
                    />
                  </Form.Item>
                )}
              />

              <Controller
                control={control}
                name="customer_note"
                render={({ field, fieldState }) => (
                  <Form.Item
                    label="Ghi chú khách hàng"
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={fieldState.error?.message}
                  >
                    <Input.TextArea {...field} rows={4} placeholder="Ghi chú nội bộ về khách đoàn" />
                  </Form.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} xl={14}>
            <div style={{ marginBottom: 16 }}>
              <BookingImportPDF onImport={applyImportedBooking} />
            </div>

            <Card
              title="Thông tin đặt phòng"
              extra={
                <Button icon={<PlusOutlined />} type="dashed" onClick={handleAddBooking}>
                  Thêm phòng
                </Button>
              }
            >
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {fields.map((field, index) => (
                  <Card
                    key={field.id}
                    size="small"
                    title={`Booking #${index + 1}`}
                    extra={
                      fields.length > 1 ? (
                        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(index)}>
                          Xóa
                        </Button>
                      ) : null
                    }
                  >
                    <Row gutter={12}>
                      <Col xs={24} md={12}>
                        <Controller
                          control={control}
                          name={`bookings.${index}.room_id`}
                          render={({ field: bookingField, fieldState }) => (
                            <Form.Item
                              label="Phòng"
                              required
                              validateStatus={fieldState.error ? 'error' : ''}
                              help={fieldState.error?.message}
                            >
                              <Select {...bookingField} options={ROOM_OPTIONS} placeholder="Chọn phòng" />
                            </Form.Item>
                          )}
                        />
                      </Col>

                      <Col xs={24} md={12}>
                        <Controller
                          control={control}
                          name={`bookings.${index}.guest_name`}
                          render={({ field: bookingField, fieldState }) => (
                            <Form.Item
                              label="Tên khách ở phòng"
                              validateStatus={fieldState.error ? 'error' : ''}
                              help={fieldState.error?.message}
                            >
                              <Input {...bookingField} placeholder="Tên khách lưu trú" />
                            </Form.Item>
                          )}
                        />
                      </Col>

                      <Col xs={24} md={12}>
                        <Controller
                          control={control}
                          name={`bookings.${index}.check_in`}
                          render={({ field: bookingField, fieldState }) => (
                            <Form.Item
                              label="Check-in"
                              required
                              validateStatus={fieldState.error ? 'error' : ''}
                              help={fieldState.error?.message}
                            >
                              <DatePicker
                                value={bookingField.value}
                                onChange={(value) => bookingField.onChange(value)}
                                format="DD/MM/YYYY"
                                style={{ width: '100%' }}
                              />
                            </Form.Item>
                          )}
                        />
                      </Col>

                      <Col xs={24} md={12}>
                        <Controller
                          control={control}
                          name={`bookings.${index}.check_out`}
                          render={({ field: bookingField, fieldState }) => (
                            <Form.Item
                              label="Check-out"
                              required
                              validateStatus={fieldState.error ? 'error' : ''}
                              help={fieldState.error?.message}
                            >
                              <DatePicker
                                value={bookingField.value}
                                onChange={(value) => bookingField.onChange(value)}
                                format="DD/MM/YYYY"
                                style={{ width: '100%' }}
                              />
                            </Form.Item>
                          )}
                        />
                      </Col>

                      <Col xs={24} md={12}>
                        <Controller
                          control={control}
                          name={`bookings.${index}.price_per_night`}
                          render={({ field: bookingField, fieldState }) => (
                            <Form.Item
                              label="Giá phòng"
                              required
                              validateStatus={fieldState.error ? 'error' : ''}
                              help={fieldState.error?.message}
                            >
                              <InputNumber<number>
                                value={bookingField.value as number}
                                onChange={(value) => bookingField.onChange(value ?? 0)}
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
                      </Col>

                      <Col xs={24} md={12}>
                        <Controller
                          control={control}
                          name={`bookings.${index}.guests_count`}
                          render={({ field: bookingField, fieldState }) => {
                            const roomId = control._formValues.bookings?.[index]?.room_id ?? ''
                            const roomCapacity = ROOM_CAPACITY_BY_ID[roomId]

                            return (
                              <Form.Item
                                label={roomCapacity ? `Số khách (tối đa ${roomCapacity})` : 'Số khách'}
                                required
                                validateStatus={fieldState.error ? 'error' : ''}
                                help={fieldState.error?.message}
                              >
                                <InputNumber
                                  value={bookingField.value}
                                  onChange={(value) => bookingField.onChange(value ?? 1)}
                                  min={1}
                                  max={roomCapacity}
                                  precision={0}
                                  style={{ width: '100%' }}
                                />
                              </Form.Item>
                            )
                          }}
                        />
                      </Col>

                      <Col xs={24} md={12}>
                        <Controller
                          control={control}
                          name={`bookings.${index}.surcharge`}
                          render={({ field: bookingField, fieldState }) => (
                            <Form.Item
                              label="Phụ thu"
                              validateStatus={fieldState.error ? 'error' : ''}
                              help={fieldState.error?.message}
                            >
                              <InputNumber
                                value={bookingField.value}
                                onChange={(value) => bookingField.onChange(value ?? 0)}
                                min={0}
                                precision={0}
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
                      </Col>

                      <Col xs={24}>
                        <Controller
                          control={control}
                          name={`bookings.${index}.note`}
                          render={({ field: bookingField, fieldState }) => (
                            <Form.Item
                              label="Ghi chú booking"
                              validateStatus={fieldState.error ? 'error' : ''}
                              help={fieldState.error?.message}
                            >
                              <Input.TextArea {...bookingField} rows={3} placeholder="Ghi chú riêng cho phòng này" />
                            </Form.Item>
                          )}
                        />
                      </Col>
                    </Row>
                  </Card>
                ))}

                {errors.bookings?.message ? (
                  <Typography.Text type="danger">{errors.bookings.message}</Typography.Text>
                ) : null}
              </Space>

              <Divider />

              <Flex justify="end">
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={createBookingMutation.isPending}
                  size="large"
                >
                  Tạo Booking
                </Button>
              </Flex>
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  )
}