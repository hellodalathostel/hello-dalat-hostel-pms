import { useRef, useMemo, useState, type JSX } from 'react'
import { useFieldArray, useForm, type SubmitHandler } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Checkbox, Collapse, Form, Input, Modal, Select, Space, Spin, Tooltip } from 'antd'
import { ScanOutlined } from '@ant-design/icons'
import { processCheckInTxn } from '@/api/checkInOutApi'
import { useOcrScan } from '@/hooks/useCheckIn'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { DocumentType, Gender, GuestCheckInPayload, ResidencyType } from '@/lib/schemas/checkInOut'

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

/**
 * Resize + compress ảnh xuống tối đa 1200px, quality 0.85
 * Giảm dung lượng ảnh camera trước khi gửi OCR để tránh timeout.
 */
async function compressImageToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const MAX_SIDE = 1200
      let { width, height } = img

      if (width > MAX_SIDE || height > MAX_SIDE) {
        if (width > height) {
          height = Math.round((height * MAX_SIDE) / width)
          width = MAX_SIDE
        } else {
          width = Math.round((width * MAX_SIDE) / height)
          height = MAX_SIDE
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas không khả dụng'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      const base64 = dataUrl.split(',')[1]
      resolve({ base64, mimeType: 'image/jpeg' })
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Không thể đọc file ảnh'))
    }

    img.src = objectUrl
  })
}

/**
 * Modal Check-in nhiều khách hàng
 * - Mỗi card khách có nút "Quét CCCD/Passport" → gọi OCR Edge Function → auto-fill form
 * - OCR dùng useOcrScan hook, kết quả map thẳng vào GuestCheckInPayload (field names khớp 1-1)
 */
export function CheckInModal({ isOpen, onClose, bookingId }: CheckInModalProps): JSX.Element {
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()
  const [formError, setFormError] = useState<string | null>(null)

  // Ref array để trigger file input ẩn cho từng khách
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Track index nào đang chạy OCR
  const [ocrLoadingIndex, setOcrLoadingIndex] = useState<number | null>(null)
  const [pendingImages, setPendingImages] = useState<File[]>([])
  const [showImagePreview, setShowImagePreview] = useState(false)
  const [targetGuestIndex, setTargetGuestIndex] = useState<number | null>(null)

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

  // OCR mutation (dùng hook có sẵn)
  const ocrMutation = useOcrScan()

  const ocrFieldMap: (keyof GuestCheckInPayload)[] = [
    'full_name',
    'date_of_birth',
    'gender',
    'nationality',
    'country',
    'document_type',
    'document_number',
    'document_name',
    'province',
    'district',
    'ward',
    'address_detail',
    'residency_type',
  ]

  /**
   * Bước 1: User chọn file(s) → hiện preview để confirm
   * accept multiple để chụp/chọn nhiều mặt CCCD cùng lúc
   */
  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
    guestIndex: number
  ): void => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = '' // reset để có thể chọn lại

    if (files.length === 0) return

    const invalidFiles = files.filter((file) => !file.type.startsWith('image/'))
    if (invalidFiles.length > 0) {
      notification.error({
        message: 'File không hợp lệ',
        description: 'Vui lòng chỉ chọn file ảnh (JPG, PNG, HEIC...).',
      })
      return
    }

    setPendingImages(files)
    setTargetGuestIndex(guestIndex)
    setShowImagePreview(true)
  }

  /**
   * Bước 2: User confirm → compress tất cả ảnh → gọi OCR → xử lý kết quả
   * Nếu OCR trả về nhiều khách → append vào form
   * Nếu OCR trả về 1 khách → fill vào guest đang xử lý (merge với existing data)
   */
  const handleOcrConfirm = async (): Promise<void> => {
    if (!pendingImages.length || targetGuestIndex === null) return

    setShowImagePreview(false)
    setOcrLoadingIndex(targetGuestIndex)

    try {
      // Compress tất cả ảnh song song
      const compressedImages = await Promise.all(
        pendingImages.map((file) => compressImageToBase64(file))
      )

      const ocrImages = compressedImages.map(({ base64, mimeType }) => ({
        data: base64,
        mime_type: mimeType,
      }))

      const results = await ocrMutation.mutateAsync(ocrImages)

      if (results.length === 0) {
        notification.warning({
          message: 'Không đọc được thông tin',
          description: 'Vui lòng thử lại với ảnh rõ hơn.',
        })
        return
      }

      if (results.length === 1) {
        for (const field of ocrFieldMap) {
          const value = results[0][field]
          if (value !== undefined && value !== null && value !== '') {
            setValue(`guests.${targetGuestIndex}.${field}`, value as never, {
              shouldValidate: true,
            })
          }
        }

        notification.success({
          message: 'Quét thành công',
          description: `Đã điền thông tin cho Khách ${targetGuestIndex + 1}. Vui lòng kiểm tra lại.`,
        })
      } else {
        results.forEach((guestData, i) => {
          if (i === 0) {
            for (const field of ocrFieldMap) {
              const value = guestData[field]
              if (value !== undefined && value !== null && value !== '') {
                setValue(`guests.${targetGuestIndex}.${field}`, value as never, {
                  shouldValidate: true,
                })
              }
            }
          } else {
            const newGuest = createDefaultGuest(false)
            const guestPatch: Partial<GuestCheckInPayload> = {}
            for (const field of ocrFieldMap) {
              const value = guestData[field]
              if (value !== undefined && value !== null && value !== '') {
                Object.assign(guestPatch, { [field]: value })
              }
            }
            append({ ...newGuest, ...guestPatch })
          }
        })

        notification.success({
          message: `Quét thành công ${results.length} khách`,
          description: 'Đã tạo thông tin cho từng khách. Vui lòng kiểm tra và bổ sung số điện thoại.',
        })
      }
    } catch {
      // Lỗi đã được handle trong useOcrScan.onError
    } finally {
      setOcrLoadingIndex(null)
      setPendingImages([])
      setTargetGuestIndex(null)
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
    setPendingImages([])
    setShowImagePreview(false)
    setTargetGuestIndex(null)
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
                <Space>
                  {/* Nút quét OCR cho từng khách */}
                  <Tooltip title="Quét CCCD hoặc Passport để tự động điền thông tin">
                    <Button
                      icon={<ScanOutlined />}
                      onClick={() => fileInputRefs.current[index]?.click()}
                      disabled={isSubmitting || ocrLoadingIndex !== null}
                      loading={ocrLoadingIndex === index}
                    >
                      {ocrLoadingIndex === index ? 'Đang quét...' : 'Quét CCCD/Passport'}
                    </Button>
                  </Tooltip>

                  {/* Input file ẩn — multiple để chọn nhiều mặt CCCD cùng lúc */}
                  <input
                    ref={(el) => { fileInputRefs.current[index] = el }}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileSelect(e, index)}
                  />

                  {fields.length > 1 && (
                    <Button danger onClick={() => remove(index)} disabled={isSubmitting}>
                      Xoá
                    </Button>
                  )}
                </Space>
              }
            >
              <Spin spinning={ocrLoadingIndex === index} tip="Đang nhận diện...">
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
              </Spin>
            </Card>
          ))}
        </Space>
      </Form>

      {/* Modal preview ảnh trước khi OCR */}
      <Modal
        open={showImagePreview}
        title={`Xác nhận quét ${pendingImages.length} ảnh`}
        onCancel={() => {
          setShowImagePreview(false)
          setPendingImages([])
          setTargetGuestIndex(null)
        }}
        footer={
          <Space>
            <Button onClick={() => { setShowImagePreview(false); setPendingImages([]); setTargetGuestIndex(null) }}>
              Huỷ
            </Button>
            <Button type="primary" onClick={handleOcrConfirm}>
              Quét thông tin
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Mẹo chụp CCCD"
            description={
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>CCCD 2 mặt: chọn cả 2 ảnh → hệ thống gộp thành 1 khách</li>
                <li>Nhiều CCCD trong 1 ảnh: chọn 1 ảnh → hệ thống tách từng người</li>
              </ul>
            }
          />
          <Space wrap>
            {pendingImages.map((file, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Ảnh ${i + 1}`}
                  style={{ width: 150, height: 100, objectFit: 'cover', borderRadius: 4, border: '1px solid #d9d9d9' }}
                />
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  {file.name.length > 20 ? `${file.name.slice(0, 17)}...` : file.name}
                </div>
              </div>
            ))}
          </Space>
        </Space>
      </Modal>
    </Modal>
  )
}