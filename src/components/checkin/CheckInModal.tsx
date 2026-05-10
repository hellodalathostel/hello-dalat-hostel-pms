import { useMemo, useState, type JSX } from 'react'
import { useFieldArray, useForm, type SubmitHandler } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Checkbox, Collapse, Form, Input, Modal, Select, Space, Upload, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { supabase } from '@/api/supabase'
import { processCheckInTxn } from '@/api/checkInOutApi'
import { parseCheckinExcel, groupByRoomAndDate } from '@/utils/parseCheckinExcel'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { DocumentType, Gender, GuestCheckInPayload, ResidencyType } from '@/lib/schemas/checkInOut'
import type { ExcelGuestRow } from '@/types/checkin'

interface CheckInModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
}

interface CheckInFormValues {
  guests: GuestCheckInPayload[]
}

const documentTypeOptions: { label: string; value: DocumentType }[] = [
  { label: 'CCCD', value: 'CCCD' },
  { label: 'Hộ chiếu', value: 'Hộ chiếu' },
  { label: 'Giấy tờ khác', value: 'Giấy tờ khác' },
]

const genderOptions: { label: string; value: Gender }[] = [
  { label: 'Nam', value: 'Nam' },
  { label: 'Nữ', value: 'Nữ' },
]

const residencyTypeOptions: { label: string; value: ResidencyType }[] = [
  { label: 'Thường trú', value: 'Thường trú' },
  { label: 'Tạm trú', value: 'Tạm trú' },
  { label: 'Địa chỉ khác', value: 'Địa chỉ khác' },
]

function createDefaultGuest(isPrimary: boolean): GuestCheckInPayload {
  return {
    is_primary: isPrimary,
    full_name: '',
    document_type: 'CCCD',
    document_number: '',
    phone: '',
    document_name: '',
    date_of_birth: '',
    gender: undefined,
    nationality: '',
    country: 'VNM',
    residency_type: undefined,
    province: '',
    district: '',
    ward: '',
    address_detail: '',
  }
}

// Chuyển đổi ExcelGuestRow sang GuestCheckInPayload
function excelRowToCheckInPayload(row: ExcelGuestRow, isPrimary: boolean): GuestCheckInPayload {
  return {
    is_primary: isPrimary,
    full_name: row.full_name,
    document_type:
      row.id_type === 'cccd'
        ? 'CCCD'
        : row.id_type === 'passport'
          ? 'Hộ chiếu'
          : 'Giấy tờ khác',
    document_number: row.id_number || undefined,
    date_of_birth: row.date_of_birth || undefined,
    gender: row.gender === 'male' ? 'Nam' : row.gender === 'female' ? 'Nữ' : undefined,
    phone: row.phone || undefined,
    nationality: row.nationality || undefined,
    address_detail: row.address || undefined,
  }
}

/**
 * Modal Check-in nhiều khách hàng
 * - Import file Excel khai báo lưu trú → tự động điền dữ liệu khách
 * - Parse Excel bằng parseCheckinExcel, chuyển đổi sang GuestCheckInPayload
 */
export function CheckInModal({ isOpen, onClose, bookingId }: CheckInModalProps): JSX.Element {
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()
  const [formError, setFormError] = useState<string | null>(null)
  const [excelLoading, setExcelLoading] = useState(false)

  const { control, handleSubmit, reset, watch, setValue } = useForm<CheckInFormValues>({
    defaultValues: {
      guests: [createDefaultGuest(true)],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'guests' })
  const guests = watch('guests')

  const primaryCount = useMemo(() => {
    return (guests ?? []).filter((g) => g?.is_primary).length
  }, [guests])

  // Import Excel và điền dữ liệu vào form
  const handleExcelUpload = async (file: File): Promise<void> => {
    setExcelLoading(true)
    try {
      // Fetch booking detail (room_id, check_in)
      const { data: booking } = await supabase
        .from('bookings')
        .select('room_id, check_in')
        .eq('id', bookingId)
        .single()

      if (!booking) {
        message.error('Không tìm thấy thông tin booking.')
        return
      }

      // Parse Excel file
      const excelRows = await parseCheckinExcel(file)

      if (excelRows.length === 0) {
        message.warning('File Excel không chứa dữ liệu khách.')
        return
      }

      // Group Excel rows theo (room_number, check_in_date)
      const grouped = groupByRoomAndDate(excelRows)

      // Tìm group khớp với booking (room_id + check_in date)
      const bookingCheckInDate = booking.check_in // YYYY-MM-DD
      const matchingKey = `${booking.room_id}__${bookingCheckInDate}`
      const matchingGuests = grouped.get(matchingKey)

      if (!matchingGuests || matchingGuests.length === 0) {
        // Nếu không tìm được, hiện danh sách tất cả groups và cho user chọn
        const availableRooms = Array.from(grouped.keys())
          .map((key) => {
            const [room, date] = key.split('__')
            return `Phòng ${room} (${date}): ${grouped.get(key)?.length ?? 0} khách`
          })
          .join('\n')

        message.error(
          `Không tìm thấy khách của phòng ${booking.room_id} ngày ${bookingCheckInDate} trong file.\n\nDữ liệu trong file:\n${availableRooms}`
        )
        return
      }

      // Chuyển đổi Excel rows sang GuestCheckInPayload
      const newGuests = matchingGuests.map((row, idx) => excelRowToCheckInPayload(row, idx === 0))

      // Thay thế danh sách khách hiện tại
      reset({ guests: newGuests })

      message.success(`Đã import ${matchingGuests.length} khách từ Excel cho phòng ${booking.room_id}. Vui lòng kiểm tra lại dữ liệu.`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Không đọc được file Excel'
      message.error(errorMsg)
    } finally {
      setExcelLoading(false)
    }
  }

  const mutation = useMutation({
    mutationFn: ({ targetBookingId, payloadGuests }: { targetBookingId: string; payloadGuests: GuestCheckInPayload[] }) =>
      processCheckInTxn(targetBookingId, payloadGuests),
    onSuccess: async () => {
      notification.success({
        message: 'Nhận phòng thành công',
        description: 'Khách hàng đã được đăng ký vào hệ thống.',
      })
      onClose()
      reset({ guests: [createDefaultGuest(true)] })
      setFormError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard_today'] }),
        queryClient.invalidateQueries({ queryKey: ['room_calendar'] }),
      ])
    },
    onError: (error) => {
      notification.error({
        message: 'Lỗi nhận phòng',
        description: error instanceof Error ? error.message : String(error),
      })
    },
  })

  const onSubmit: SubmitHandler<CheckInFormValues> = (values) => {
    const currentGuests = values.guests ?? []
    if (currentGuests.length === 0) {
      setFormError('Phải có ít nhất 1 khách để check-in.')
      return
    }
    if (currentGuests.filter((g) => g.is_primary).length !== 1) {
      setFormError('Phải có chính xác 1 khách được đánh dấu là đại diện.')
      return
    }
    if (currentGuests.some((g) => !g.full_name?.trim())) {
      setFormError('Vui lòng nhập họ tên cho tất cả khách.')
      return
    }
    const primary = currentGuests.find((g) => g.is_primary)
    if (!primary?.phone?.trim()) {
      setFormError('Khách đại diện phải có số điện thoại.')
      return
    }
    setFormError(null)
    mutation.mutate({ targetBookingId: bookingId, payloadGuests: currentGuests })
  }

  const handleClose = () => {
    onClose()
    setFormError(null)
    reset({ guests: [createDefaultGuest(true)] })
  }

  const isSubmitting = mutation.isPending

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      title="Nhận phòng"
      width={920}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={handleClose} disabled={isSubmitting}>Huỷ</Button>
          <Button type="primary" onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
            Xác nhận nhận phòng
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <Alert
          type={primaryCount === 1 ? 'success' : 'error'}
          showIcon
          message={primaryCount === 1 ? '✓ Đã chọn khách đại diện' : '✗ Phải chọn chính xác 1 khách đại diện'}
          description="Khách đại diện sẽ được ghi nhận trong hồ sơ DK14."
          style={{ marginBottom: 16 }}
        />

        {formError && (
          <Alert type="error" showIcon message={formError} style={{ marginBottom: 16 }} />
        )}

        <Space style={{ marginBottom: 16 }}>
          <Button onClick={() => append(createDefaultGuest(false))} disabled={isSubmitting}>
            + Thêm khách ở cùng phòng
          </Button>
        </Space>

        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {fields.map((field, index) => (
            <Card
              key={field.id}
              title={`Khách ${index + 1}${guests?.[index]?.is_primary ? ' (Đại diện)' : ''}`}
              extra={
                fields.length > 1 && (
                  <Button danger onClick={() => remove(index)} disabled={isSubmitting}>
                    Xoá
                  </Button>
                )
              }
            >
              {/* Checkbox khách đại diện */}
                <Form.Item label="Khách đại diện">
                  <Checkbox
                    checked={Boolean(guests?.[index]?.is_primary)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        fields.forEach((_, i) => setValue(`guests.${i}.is_primary`, i === index))
                      } else {
                        setValue(`guests.${index}.is_primary`, false)
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    Đánh dấu là khách đại diện của đoàn
                  </Checkbox>
                </Form.Item>

                {/* Họ tên */}
                <Form.Item
                  label="Họ tên *"
                  required
                  validateStatus={!guests?.[index]?.full_name?.trim() ? 'error' : undefined}
                  help={!guests?.[index]?.full_name?.trim() ? 'Họ tên là bắt buộc.' : undefined}
                >
                  <Input
                    value={guests?.[index]?.full_name ?? ''}
                    onChange={(e) => setValue(`guests.${index}.full_name`, e.target.value, { shouldValidate: true })}
                    placeholder="Nhập họ tên khách (bắt buộc)"
                    disabled={isSubmitting}
                  />
                </Form.Item>

                {/* Loại giấy tờ */}
                <Form.Item label="Loại giấy tờ">
                  <Select
                    value={guests?.[index]?.document_type}
                    options={documentTypeOptions}
                    onChange={(v) => setValue(`guests.${index}.document_type`, v)}
                    disabled={isSubmitting}
                  />
                </Form.Item>

                {/* Số giấy tờ */}
                <Form.Item label="Số giấy tờ">
                  <Input
                    value={guests?.[index]?.document_number ?? ''}
                    onChange={(e) => setValue(`guests.${index}.document_number`, e.target.value)}
                    placeholder="Nhập số giấy tờ"
                    disabled={isSubmitting}
                  />
                </Form.Item>

                {/* Số điện thoại */}
                <Form.Item label="Số điện thoại">
                  <Input
                    value={guests?.[index]?.phone ?? ''}
                    onChange={(e) => setValue(`guests.${index}.phone`, e.target.value)}
                    placeholder="Nhập số điện thoại"
                    disabled={isSubmitting}
                  />
                </Form.Item>

                {/* Thông tin bổ sung (collapse) */}
                <Collapse
                  items={[
                    {
                      key: `more-${field.id}`,
                      label: '📋 Thông tin bổ sung (mở rộng)',
                      children: (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <Form.Item label="Tên giấy tờ">
                            <Input
                              value={guests?.[index]?.document_name ?? ''}
                              onChange={(e) => setValue(`guests.${index}.document_name`, e.target.value)}
                              placeholder="Ví dụ: Căn cước công dân"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Ngày sinh">
                            <Input
                              value={guests?.[index]?.date_of_birth ?? ''}
                              onChange={(e) => setValue(`guests.${index}.date_of_birth`, e.target.value)}
                              placeholder="Ví dụ: 1990-12-31"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Giới tính">
                            <Select
                              allowClear
                              value={guests?.[index]?.gender}
                              options={genderOptions}
                              onChange={(v) => setValue(`guests.${index}.gender`, v)}
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Quốc tịch">
                            <Input
                              value={guests?.[index]?.nationality ?? ''}
                              onChange={(e) => setValue(`guests.${index}.nationality`, e.target.value)}
                              placeholder="Ví dụ: VNM"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Quốc gia">
                            <Input
                              value={guests?.[index]?.country ?? ''}
                              onChange={(e) => setValue(`guests.${index}.country`, e.target.value)}
                              placeholder="Ví dụ: VNM"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Loại cư trú">
                            <Select
                              allowClear
                              value={guests?.[index]?.residency_type}
                              options={residencyTypeOptions}
                              onChange={(v) => setValue(`guests.${index}.residency_type`, v)}
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Tỉnh/Thành phố">
                            <Input
                              value={guests?.[index]?.province ?? ''}
                              onChange={(e) => setValue(`guests.${index}.province`, e.target.value)}
                              placeholder="Ví dụ: Lâm Đồng"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Quận/Huyện">
                            <Input
                              value={guests?.[index]?.district ?? ''}
                              onChange={(e) => setValue(`guests.${index}.district`, e.target.value)}
                              placeholder="Ví dụ: Thành phố Đà Lạt"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Phường/Xã">
                            <Input
                              value={guests?.[index]?.ward ?? ''}
                              onChange={(e) => setValue(`guests.${index}.ward`, e.target.value)}
                              placeholder="Ví dụ: Phường 1"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Địa chỉ chi tiết">
                            <Input.TextArea
                              value={guests?.[index]?.address_detail ?? ''}
                              onChange={(e) => setValue(`guests.${index}.address_detail`, e.target.value)}
                              rows={2}
                              placeholder="Nhập địa chỉ cụ thể"
                              disabled={isSubmitting}
                            />
                          </Form.Item>
                        </Space>
                      ),
                    },
                  ]}
                />
            </Card>
          ))}
        </Space>
      </Form>

      {/* Modal import Excel */}
      <Modal
        open={isOpen}
        title="Nhận phòng"
        width={920}
        destroyOnHidden
        onCancel={handleClose}
        footer={
          <Space>
            <Button onClick={handleClose} disabled={isSubmitting}>Huỷ</Button>
            <Button type="primary" onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
              Xác nhận nhận phòng
            </Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Alert
            type={primaryCount === 1 ? 'success' : 'error'}
            showIcon
            message={primaryCount === 1 ? '✓ Đã chọn khách đại diện' : '✗ Phải chọn chính xác 1 khách đại diện'}
            description="Khách đại diện sẽ được ghi nhận trong hồ sơ DK14."
            style={{ marginBottom: 16 }}
          />

          {formError && (
            <Alert type="error" showIcon message={formError} style={{ marginBottom: 16 }} />
          )}

          <Form.Item label="Import khách từ file Excel">
            <Upload
              accept=".xlsx,.xls"
              maxCount={1}
              beforeUpload={(file) => {
                handleExcelUpload(file)
                return false
              }}
            >
              <Button icon={<UploadOutlined />} loading={excelLoading}>
                Chọn file khai báo lưu trú
              </Button>
            </Upload>
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              Chỉ upload file Excel từ khai báo lưu trú của Công an địa phương
            </div>
          </Form.Item>

          <Space style={{ marginBottom: 16 }}>
            <Button onClick={() => append(createDefaultGuest(false))} disabled={isSubmitting}>
              + Thêm khách ở cùng phòng
            </Button>
          </Space>

          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {fields.map((field, index) => (
              <Card
                key={field.id}
                title={`Khách ${index + 1}${guests?.[index]?.is_primary ? ' (Đại diện)' : ''}`}
                extra={
                  fields.length > 1 && (
                    <Button danger onClick={() => remove(index)} disabled={isSubmitting}>
                      Xoá
                    </Button>
                  )
                }
              >
                {/* Checkbox khách đại diện */}
                <Form.Item label="Khách đại diện">
                  <Checkbox
                    checked={Boolean(guests?.[index]?.is_primary)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        fields.forEach((_, i) => setValue(`guests.${i}.is_primary`, i === index))
                      } else {
                        setValue(`guests.${index}.is_primary`, false)
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    Đánh dấu là khách đại diện của đoàn
                  </Checkbox>
                </Form.Item>

                {/* Họ tên */}
                <Form.Item
                  label="Họ tên *"
                  required
                  validateStatus={!guests?.[index]?.full_name?.trim() ? 'error' : undefined}
                  help={!guests?.[index]?.full_name?.trim() ? 'Họ tên là bắt buộc.' : undefined}
                >
                  <Input
                    value={guests?.[index]?.full_name ?? ''}
                    onChange={(e) => setValue(`guests.${index}.full_name`, e.target.value, { shouldValidate: true })}
                    placeholder="Nhập họ tên khách (bắt buộc)"
                    disabled={isSubmitting}
                  />
                </Form.Item>

                {/* Loại giấy tờ */}
                <Form.Item label="Loại giấy tờ">
                  <Select
                    value={guests?.[index]?.document_type}
                    options={documentTypeOptions}
                    onChange={(v) => setValue(`guests.${index}.document_type`, v)}
                    disabled={isSubmitting}
                  />
                </Form.Item>

                {/* Số giấy tờ */}
                <Form.Item label="Số giấy tờ">
                  <Input
                    value={guests?.[index]?.document_number ?? ''}
                    onChange={(e) => setValue(`guests.${index}.document_number`, e.target.value)}
                    placeholder="Nhập số giấy tờ"
                    disabled={isSubmitting}
                  />
                </Form.Item>

                {/* Số điện thoại */}
                <Form.Item label="Số điện thoại">
                  <Input
                    value={guests?.[index]?.phone ?? ''}
                    onChange={(e) => setValue(`guests.${index}.phone`, e.target.value)}
                    placeholder="Nhập số điện thoại"
                    disabled={isSubmitting}
                  />
                </Form.Item>

                {/* Thông tin bổ sung (collapse) */}
                <Collapse
                  items={[
                    {
                      key: `more-${field.id}`,
                      label: '📋 Thông tin bổ sung (mở rộng)',
                      children: (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <Form.Item label="Tên giấy tờ">
                            <Input
                              value={guests?.[index]?.document_name ?? ''}
                              onChange={(e) => setValue(`guests.${index}.document_name`, e.target.value)}
                              placeholder="Ví dụ: Căn cước công dân"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Ngày sinh">
                            <Input
                              value={guests?.[index]?.date_of_birth ?? ''}
                              onChange={(e) => setValue(`guests.${index}.date_of_birth`, e.target.value)}
                              placeholder="Ví dụ: 1990-12-31"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Giới tính">
                            <Select
                              allowClear
                              value={guests?.[index]?.gender}
                              options={genderOptions}
                              onChange={(v) => setValue(`guests.${index}.gender`, v)}
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Quốc tịch">
                            <Input
                              value={guests?.[index]?.nationality ?? ''}
                              onChange={(e) => setValue(`guests.${index}.nationality`, e.target.value)}
                              placeholder="Ví dụ: VNM"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Quốc gia">
                            <Input
                              value={guests?.[index]?.country ?? ''}
                              onChange={(e) => setValue(`guests.${index}.country`, e.target.value)}
                              placeholder="Ví dụ: VNM"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Loại cư trú">
                            <Select
                              allowClear
                              value={guests?.[index]?.residency_type}
                              options={residencyTypeOptions}
                              onChange={(v) => setValue(`guests.${index}.residency_type`, v)}
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Tỉnh/Thành phố">
                            <Input
                              value={guests?.[index]?.province ?? ''}
                              onChange={(e) => setValue(`guests.${index}.province`, e.target.value)}
                              placeholder="Ví dụ: Lâm Đồng"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Quận/Huyện">
                            <Input
                              value={guests?.[index]?.district ?? ''}
                              onChange={(e) => setValue(`guests.${index}.district`, e.target.value)}
                              placeholder="Ví dụ: Thành phố Đà Lạt"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Phường/Xã">
                            <Input
                              value={guests?.[index]?.ward ?? ''}
                              onChange={(e) => setValue(`guests.${index}.ward`, e.target.value)}
                              placeholder="Ví dụ: Phường 1"
                              disabled={isSubmitting}
                            />
                          </Form.Item>

                          <Form.Item label="Địa chỉ chi tiết">
                            <Input.TextArea
                              value={guests?.[index]?.address_detail ?? ''}
                              onChange={(e) => setValue(`guests.${index}.address_detail`, e.target.value)}
                              rows={2}
                              placeholder="Nhập địa chỉ cụ thể"
                              disabled={isSubmitting}
                            />
                          </Form.Item>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ))}
          </Space>
        </Form>
      </Modal>
    </Modal>
  )
}