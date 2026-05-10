import { useState, type JSX } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Upload,
} from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { supabase } from '@/api/supabase'
import { parseCheckinExcel } from '@/utils/parseCheckinExcel'
import { normalizeError } from '@/shared/utils/normalizeError'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { ExcelGuestRow } from '@/types/checkin'

interface CheckInModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
}

interface ManualGuestFormValues {
  full_name: string
  document_number: string
  nationality: string
  date_of_birth?: Dayjs
  gender?: 'Nam' | 'Nữ'
}

interface CheckInGuestPayload {
  full_name: string
  document_number: string
  nationality: string
  date_of_birth: string | null
  gender: 'Nam' | 'Nữ' | null
}

interface BookingContext {
  room_id: string
  check_in: string
  check_out: string
  price: number
}

function toGuestPayloadFromExcel(row: ExcelGuestRow): CheckInGuestPayload {
  return {
    full_name: row.full_name,
    document_number: row.id_number,
    nationality: row.nationality,
    date_of_birth: row.date_of_birth || null,
    gender: row.gender === 'male' ? 'Nam' : row.gender === 'female' ? 'Nữ' : null,
  }
}

// [Fix 4] — Chuyển CheckInModal sang flow không OCR, submit bằng RPC create_group_booking_txn.
export function CheckInModal({ isOpen, onClose, bookingId }: CheckInModalProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'excel' | 'manual'>('excel')
  const [excelRows, setExcelRows] = useState<ExcelGuestRow[]>([])
  const [isParsingExcel, setIsParsingExcel] = useState(false)
  const [manualForm] = Form.useForm<ManualGuestFormValues>()
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()

  // [Fix 4] — Lấy booking hiện tại để dựng payload RPC, không dùng Edge Function.
  const getBookingContext = async (): Promise<BookingContext> => {
    const { data, error } = await supabase
      .from('bookings')
      .select('room_id, check_in, check_out, price')
      .eq('id', bookingId)
      .single()

    if (error || !data) {
      throw new Error('Không tìm thấy booking để check-in')
    }

    return {
      room_id: data.room_id,
      check_in: data.check_in,
      check_out: data.check_out,
      price: data.price ?? 0,
    }
  }

  const checkInMutation = useMutation({
    mutationKey: ['check-in', bookingId],
    mutationFn: async (guests: CheckInGuestPayload[]) => {
      try {
        const booking = await getBookingContext()
        const primaryGuest = guests[0]

        if (!primaryGuest) {
          throw new Error('Danh sách khách check-in trống')
        }

        const { error } = await supabase.rpc('create_group_booking_txn', {
          p_group: {
            customer_name: primaryGuest.full_name,
            customer_phone: '',
            customer_note: JSON.stringify({
              checkin_source: activeTab,
              guests,
            }),
            customer_cccd: primaryGuest.document_number,
            source: 'Walk-in',
            channel_fee_rate: 0,
          },
          p_bookings: [
            {
              room_id: booking.room_id,
              check_in: booking.check_in,
              check_out: booking.check_out,
              price: booking.price,
              guest_name: primaryGuest.full_name,
              guests_count: guests.length,
              note: 'Check-in tại quầy',
              status: 'checked-in',
            },
          ],
          p_services: null,
          p_discounts: null,
        })

        if (error) {
          throw error
        }
      } catch (error) {
        throw normalizeError(error)
      }
    },
    onSuccess: async () => {
      message.success('Check-in thành công')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
        queryClient.invalidateQueries({ queryKey: ['room-calendar'] }),
      ])
      handleClose()
    },
    onError: () => {
      // [Fix 4] — Mọi mutation lỗi đều hiển thị toast AntD theo quy định.
      message.error('Check-in thất bại')
    },
  })

  const handleExcelUpload = async (file: File): Promise<boolean> => {
    setIsParsingExcel(true)
    try {
      const rows = await parseCheckinExcel(file)
      setExcelRows(rows)

      if (rows.length === 0) {
        message.warning('File Excel không có dữ liệu khách')
      } else {
        message.success(`Đã đọc ${rows.length} khách từ file Excel`)
      }
    } catch {
      message.error('Không đọc được file Excel')
    } finally {
      setIsParsingExcel(false)
    }

    return false
  }

  const submitExcelCheckIn = () => {
    if (excelRows.length === 0) {
      message.error('Vui lòng import file Excel trước khi xác nhận')
      return
    }

    checkInMutation.mutate(excelRows.map(toGuestPayloadFromExcel))
  }

  const submitManualCheckIn = async () => {
    try {
      const values = await manualForm.validateFields()
      checkInMutation.mutate([
        {
          full_name: values.full_name,
          document_number: values.document_number,
          nationality: values.nationality,
          date_of_birth: values.date_of_birth ? dayjs(values.date_of_birth).format('YYYY-MM-DD') : null,
          gender: values.gender ?? null,
        },
      ])
    } catch {
      message.error('Vui lòng kiểm tra lại thông tin nhập tay')
    }
  }

  const handleClose = () => {
    setExcelRows([])
    setActiveTab('excel')
    manualForm.resetFields()
    onClose()
  }

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      title="Nhận phòng"
      width={960}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={handleClose} disabled={checkInMutation.isPending}>
            Huỷ
          </Button>
          <Button
            type="primary"
            loading={checkInMutation.isPending}
            onClick={activeTab === 'excel' ? submitExcelCheckIn : () => void submitManualCheckIn()}
          >
            Xác nhận Check-in
          </Button>
        </Space>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'excel' | 'manual')}
        items={[
          {
            key: 'excel',
            label: 'Import Excel',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Upload
                  accept=".xlsx,.xls"
                  maxCount={1}
                  beforeUpload={(file) => handleExcelUpload(file)}
                  showUploadList
                >
                  <Button icon={<UploadOutlined />} loading={isParsingExcel}>
                    Chọn file ĐK14
                  </Button>
                </Upload>

                <Table
                  size="small"
                  pagination={false}
                  dataSource={excelRows}
                  rowKey={(row, index) => `${row.stt}-${index ?? 0}`}
                  locale={{ emptyText: 'Chưa có dữ liệu preview từ Excel' }}
                  columns={[
                    {
                      title: 'Họ tên',
                      dataIndex: 'full_name',
                    },
                    {
                      title: 'Quốc tịch',
                      dataIndex: 'nationality',
                      width: 120,
                    },
                    {
                      title: 'Phòng',
                      dataIndex: 'room_number',
                      width: 100,
                    },
                    {
                      title: 'Ngày check-in',
                      dataIndex: 'check_in',
                      width: 160,
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'manual',
            label: 'Nhập tay',
            children: (
              <Form layout="vertical" form={manualForm}>
                <Form.Item
                  label="Họ tên"
                  name="full_name"
                  rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
                >
                  <Input placeholder="Nhập họ tên khách" />
                </Form.Item>

                <Form.Item
                  label="Số CCCD/Passport"
                  name="document_number"
                  rules={[{ required: true, message: 'Vui lòng nhập số giấy tờ' }]}
                >
                  <Input placeholder="Nhập số CCCD hoặc Passport" />
                </Form.Item>

                <Form.Item
                  label="Quốc tịch"
                  name="nationality"
                  rules={[{ required: true, message: 'Vui lòng nhập quốc tịch' }]}
                >
                  <Input placeholder="Ví dụ: VNM" />
                </Form.Item>

                <Form.Item label="Ngày sinh" name="date_of_birth">
                  <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item label="Giới tính" name="gender">
                  <Select
                    allowClear
                    options={[
                      { label: 'Nam', value: 'Nam' },
                      { label: 'Nữ', value: 'Nữ' },
                    ]}
                    placeholder="Chọn giới tính"
                  />
                </Form.Item>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  )
}
