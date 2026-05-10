import { useState, type JSX } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
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
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { ExcelGuestRow, CheckinGuestPayload } from '@/types/checkin'
import {
  DOCUMENT_TYPE_OPTIONS,
  mapExcelIdTypeToDatabaseFormat,
} from '@/types/checkin'
import { useCheckIn } from '@/hooks/useCheckIn'
import { groupByRoomAndDate, parseCheckinExcel } from '@/utils/parseCheckinExcel'

interface CheckInModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
}

interface ManualGuestFormValues {
  full_name: string
  document_type: string
  document_number: string
  nationality: string
  date_of_birth?: Dayjs
  gender?: 'Nam' | 'Nữ'
}

function toGuestPayloadFromExcel(row: ExcelGuestRow): CheckinGuestPayload {
  return {
    full_name: row.full_name,
    document_type: mapExcelIdTypeToDatabaseFormat(row.id_type), // Mapping từ Excel -> DB format
    document_number: row.id_number,
    nationality: row.nationality,
    date_of_birth: row.date_of_birth || undefined,
    gender: row.gender === 'male' ? 'Nam' : row.gender === 'female' ? 'Nữ' : undefined,
    address_detail: row.address || undefined,
  }
}

function normalizeRoomCode(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '').replace(/^ph[oò]ng/i, '')
}

// [Fix 4] — Chuyển CheckInModal sang flow RPC checkin_booking_txn.
export function CheckInModal({ isOpen, onClose, bookingId }: CheckInModalProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'excel' | 'manual'>('excel')
  const [excelRows, setExcelRows] = useState<ExcelGuestRow[]>([])
  const [isParsingExcel, setIsParsingExcel] = useState(false)
  const [manualForm] = Form.useForm<ManualGuestFormValues>()
  const { message } = useAppFeedback()
  const { mutate: checkin, isPending } = useCheckIn()

  const handleExcelUpload = async (file: File): Promise<boolean> => {
    setIsParsingExcel(true)
    try {
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('room_id, check_in')
        .eq('id', bookingId)
        .single()

      if (bookingError || !booking) {
        message.error('Không tải được thông tin booking hiện tại để lọc dữ liệu Excel')
        return false
      }

      const rows = await parseCheckinExcel(file)
      if (rows.length === 0) {
        setExcelRows([])
        message.warning('File Excel không có dữ liệu khách')
        return false
      }

      const bookingCheckInDate = dayjs(booking.check_in).format('YYYY-MM-DD')
      const groupedRows = groupByRoomAndDate(rows)
      const exactKey = `${booking.room_id}__${bookingCheckInDate}`

      let matchedRows = groupedRows.get(exactKey) ?? []

      if (matchedRows.length === 0) {
        const normalizedBookingRoom = normalizeRoomCode(booking.room_id)
        for (const [groupKey, guests] of groupedRows.entries()) {
          const [roomNumber, checkInDate] = groupKey.split('__')
          if (
            normalizeRoomCode(roomNumber) === normalizedBookingRoom &&
            checkInDate === bookingCheckInDate
          ) {
            matchedRows = guests
            break
          }
        }
      }

      setExcelRows(matchedRows)

      if (matchedRows.length > 0) {
        message.success(
          `Đã lọc ${matchedRows.length}/${rows.length} khách cho phòng ${booking.room_id} ngày ${dayjs(booking.check_in).format('DD/MM/YYYY')}`,
        )
      } else {
        const availableGroups = [...groupedRows.entries()]
          .map(([groupKey, guests]) => {
            const [roomNumber, checkInDate] = groupKey.split('__')
            const displayDate = checkInDate
              ? dayjs(checkInDate).format('DD/MM/YYYY')
              : 'không rõ ngày'

            return `Phòng ${roomNumber} (${displayDate}) - ${guests.length} khách`
          })
          .join('; ')

        message.error(
          `Không tìm thấy khách cho booking hiện tại (phòng ${booking.room_id}, ngày ${dayjs(booking.check_in).format('DD/MM/YYYY')}). Dữ liệu trong file: ${availableGroups || 'không có nhóm hợp lệ'}`,
        )
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

    handleConfirm(excelRows.map(toGuestPayloadFromExcel))
  }

  const submitManualCheckIn = async () => {
    try {
      const values = await manualForm.validateFields()
      handleConfirm([
        {
          full_name: values.full_name,
          document_type: values.document_type as any, // Đã validate là một trong options
          document_number: values.document_number,
          nationality: values.nationality,
          date_of_birth: values.date_of_birth ? dayjs(values.date_of_birth).format('YYYY-MM-DD') : undefined,
          gender: values.gender ?? undefined,
        },
      ])
    } catch {
      message.error('Vui lòng kiểm tra lại thông tin nhập tay')
    }
  }

  const handleConfirm = (guests: CheckinGuestPayload[]) => {
    if (guests.length === 0) {
      message.error('Danh sách khách check-in trống')
      return
    }

    checkin(
      { booking_id: bookingId, guests },
      { onSuccess: () => handleClose() },
    )
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
          <Button onClick={handleClose} disabled={isPending}>
            Huỷ
          </Button>
          <Button
            type="primary"
            loading={isPending}
            onClick={activeTab === 'excel' ? submitExcelCheckIn : () => void submitManualCheckIn()}
          >
            Xác nhận Check-in
          </Button>
        </Space>
      }

  const handleExcelUpload = async (file: File): Promise<boolean> => {
    setIsParsingExcel(true)
    try {
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('room_id, check_in')
        .eq('id', bookingId)
        .single()

      if (bookingError || !booking) {
        message.error('Không tải được thông tin booking hiện tại để lọc dữ liệu Excel')
        return false
      }

      const rows = await parseCheckinExcel(file)
      if (rows.length === 0) {
        setExcelRows([])
        message.warning('File Excel không có dữ liệu khách')
        return false
      }

      const bookingCheckInDate = dayjs(booking.check_in).format('YYYY-MM-DD')
      const groupedRows = groupByRoomAndDate(rows)
      const exactKey = `${booking.room_id}__${bookingCheckInDate}`

      let matchedRows = groupedRows.get(exactKey) ?? []

      if (matchedRows.length === 0) {
        const normalizedBookingRoom = normalizeRoomCode(booking.room_id)
        for (const [groupKey, guests] of groupedRows.entries()) {
          const [roomNumber, checkInDate] = groupKey.split('__')
          if (
            normalizeRoomCode(roomNumber) === normalizedBookingRoom &&
            checkInDate === bookingCheckInDate
          ) {
            matchedRows = guests
            break
          }
        }
      }

      setExcelRows(matchedRows)

      if (matchedRows.length > 0) {
        message.success(
          `Đã lọc ${matchedRows.length}/${rows.length} khách cho phòng ${booking.room_id} ngày ${dayjs(booking.check_in).format('DD/MM/YYYY')}`,
        )
      } else {
        const availableGroups = [...groupedRows.entries()]
          .map(([groupKey, guests]) => {
            const [roomNumber, checkInDate] = groupKey.split('__')
            const displayDate = checkInDate
              ? dayjs(checkInDate).format('DD/MM/YYYY')
              : 'không rõ ngày'

            return `Phòng ${roomNumber} (${displayDate}) - ${guests.length} khách`
          })
          .join('; ')

        message.error(
          `Không tìm thấy khách cho booking hiện tại (phòng ${booking.room_id}, ngày ${dayjs(booking.check_in).format('DD/MM/YYYY')}). Dữ liệu trong file: ${availableGroups || 'không có nhóm hợp lệ'}`,
        )
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

    handleConfirm(excelRows.map(toGuestPayloadFromExcel))
  }

  const submitManualCheckIn = async () => {
    try {
      const values = await manualForm.validateFields()
      handleConfirm([
        {
          full_name: values.full_name,
          document_type: values.document_type,
          document_number: values.document_number,
          nationality: values.nationality,
          date_of_birth: values.date_of_birth ? dayjs(values.date_of_birth).format('YYYY-MM-DD') : undefined,
          gender: values.gender ?? undefined,
        },
      ])
    } catch {
      message.error('Vui lòng kiểm tra lại thông tin nhập tay')
    }
  }

  const handleConfirm = (guests: CheckinGuestPayload[]) => {
    if (guests.length === 0) {
      message.error('Danh sách khách check-in trống')
      return
    }

    checkin(
      { booking_id: bookingId, guests },
      { onSuccess: () => handleClose() },
    )
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
          <Button onClick={handleClose} disabled={isPending}>
            Huỷ
          </Button>
          <Button
            type="primary"
            loading={isPending}
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
                  label="Loại giấy tờ"
                  name="document_type"
                  initialValue="CCCD"
                  rules={[{ required: true, message: 'Vui lòng chọn loại giấy tờ' }]}
                >
                  <Select
                    options={DOCUMENT_TYPE_OPTIONS}
                    placeholder="Chọn loại giấy tờ"
                  />
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
