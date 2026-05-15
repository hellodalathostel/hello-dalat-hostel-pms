import { useState } from 'react'
import { Button, Dropdown, Modal, InputNumber, DatePicker, Space, Tooltip, message } from 'antd'
import { FileTextOutlined, DownOutlined, PrinterOutlined, MessageOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import dayjs from 'dayjs'
import { useDocumentGenerator } from '@/hooks/useDocumentGenerator'
import { useDocumentLog } from '@/hooks/useDocumentLog'

interface Props {
  groupId: string
  bookingId?: string        // booking đầu tiên nếu cần
  guestName: string
  guestPhone?: string
  checkIn: string           // ISO date
  checkOut: string
  roomName: string
  grandTotal: number
  totalPaid: number
  // Services để đưa vào snapshot
  services?: Array<{ name: string; price: number; qty: number }>
}

// Nhà nghỉ info hardcode (cùng với useDocumentGenerator)
const HOSTEL_INFO = {
  name: 'HKD Chào Đà Lạt',
  address: '33/18/2 Phan Đình Phùng, P.1, Đà Lạt',
  phone: '0969 975 935',
  bank: 'Vietcombank',
  stk: '9969975935',
  accountName: 'Nguyễn Thanh Hiếu',
}

export function DocumentActionsMenu({
  groupId,
  bookingId,
  guestName,
  guestPhone,
  checkIn,
  checkOut,
  roomName,
  grandTotal,
  totalPaid,
  services = [],
}: Props) {
  const { generatePDF, generateZaloText } = useDocumentGenerator()
  const { logDocument } = useDocumentLog()

  // State cho modal deposit_request (cần nhập số tiền + deadline)
  const [depositModal, setDepositModal] = useState(false)
  const [depositAmount, setDepositAmount] = useState<number>(Math.round(grandTotal * 0.3))
  const [depositDeadline, setDepositDeadline] = useState(dayjs().add(2, 'day'))

  // Snapshot chung để lưu vào document_logs
  const buildSnapshot = (extra?: Record<string, unknown>) => ({
    guest_name: guestName,
    guest_phone: guestPhone,
    check_in: checkIn,
    check_out: checkOut,
    room_name: roomName,
    grand_total: grandTotal,
    total_paid: totalPaid,
    services,
    hostel: HOSTEL_INFO,
    ...extra,
  })

  // Helper: generate PDF rồi log
  const handlePDF = async (
    docType: 'booking_confirmation' | 'deposit_request' | 'deposit_confirmation' | 'invoice' | 'arrival_notice',
    extra?: Record<string, unknown>
  ) => {
    const snapshot = buildSnapshot(extra)
    await generatePDF(docType, snapshot)
    logDocument({
      p_group_id: groupId,
      p_booking_id: bookingId,
      p_doc_type: docType,
      p_doc_format: 'pdf',
      p_content_snapshot: snapshot,
      p_recipient_name: guestName,
      p_recipient_phone: guestPhone,
    })
  }

  // Helper: copy Zalo text rồi log
  const handleZalo = async (
    docType: 'booking_confirmation' | 'deposit_request' | 'deposit_confirmation' | 'invoice' | 'arrival_notice',
    extra?: Record<string, unknown>
  ) => {
    const snapshot = buildSnapshot(extra)
    const text = generateZaloText(docType, snapshot)
    await navigator.clipboard.writeText(text)
    message.success('Đã copy text Zalo!')
    logDocument({
      p_group_id: groupId,
      p_booking_id: bookingId,
      p_doc_type: docType,
      p_doc_format: 'zalo_text',
      p_content_snapshot: snapshot,
      p_sent_via: 'zalo',
      p_recipient_name: guestName,
      p_recipient_phone: guestPhone,
    })
  }

  // Xử lý deposit_request (cần modal nhập thêm)
  const handleDepositRequest = async (format: 'pdf' | 'zalo_text') => {
    const extra = {
      deposit_amount: depositAmount,
      deposit_deadline: depositDeadline.format('DD/MM/YYYY'),
    }
    if (format === 'pdf') await handlePDF('deposit_request', extra)
    else await handleZalo('deposit_request', extra)
    setDepositModal(false)
  }

  const menuItems: MenuProps['items'] = [
    {
      key: 'booking_confirmation',
      label: 'Xác nhận đặt phòng',
      children: [
        {
          key: 'bc_pdf',
          label: (
            <Space><PrinterOutlined />In PDF</Space>
          ),
          onClick: () => handlePDF('booking_confirmation'),
        },
        {
          key: 'bc_zalo',
          label: (
            <Space><MessageOutlined />Copy Zalo</Space>
          ),
          onClick: () => handleZalo('booking_confirmation'),
        },
      ],
    },
    {
      key: 'deposit_request',
      label: 'Yêu cầu cọc',
      onClick: () => setDepositModal(true), // mở modal nhập số tiền trước
    },
    {
      key: 'deposit_confirmation',
      label: 'Xác nhận đã cọc',
      children: [
        {
          key: 'dc_pdf',
          label: <Space><PrinterOutlined />In PDF</Space>,
          onClick: () => handlePDF('deposit_confirmation'),
        },
        {
          key: 'dc_zalo',
          label: <Space><MessageOutlined />Copy Zalo</Space>,
          onClick: () => handleZalo('deposit_confirmation'),
        },
      ],
    },
    {
      key: 'invoice',
      label: 'Hóa đơn',
      children: [
        {
          key: 'inv_pdf',
          label: <Space><PrinterOutlined />In PDF</Space>,
          onClick: () => handlePDF('invoice'),
        },
        {
          key: 'inv_zalo',
          label: <Space><MessageOutlined />Copy Zalo</Space>,
          onClick: () => handleZalo('invoice'),
        },
      ],
    },
    {
      key: 'arrival_notice',
      label: 'Thông báo đến',
      children: [
        {
          key: 'an_pdf',
          label: <Space><PrinterOutlined />In PDF</Space>,
          onClick: () => handlePDF('arrival_notice'),
        },
        {
          key: 'an_zalo',
          label: <Space><MessageOutlined />Copy Zalo</Space>,
          onClick: () => handleZalo('arrival_notice'),
        },
      ],
    },
  ]

  return (
    <>
      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <Button icon={<FileTextOutlined />}>
          Tài liệu <DownOutlined />
        </Button>
      </Dropdown>

      {/* Modal yêu cầu cọc — nhập số tiền + deadline trước khi generate */}
      <Modal
        title="Yêu cầu đặt cọc"
        open={depositModal}
        onCancel={() => setDepositModal(false)}
        footer={null}
        width={360}
      >
        <Space direction="vertical" style={{ width: '100%', paddingTop: 8 }} size="middle">
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Số tiền cọc (VND)</div>
            <InputNumber
              style={{ width: '100%' }}
              value={depositAmount}
              onChange={(v) => setDepositAmount(v ?? 0)}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => Number(v?.replace(/,/g, '') ?? 0)}
              min={0}
              max={grandTotal}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Hạn cọc</div>
            <DatePicker
              style={{ width: '100%' }}
              value={depositDeadline}
              onChange={(d) => d && setDepositDeadline(d)}
              format="DD/MM/YYYY"
            />
          </div>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => handleDepositRequest('zalo_text')} icon={<MessageOutlined />}>
              Copy Zalo
            </Button>
            <Button type="primary" onClick={() => handleDepositRequest('pdf')} icon={<PrinterOutlined />}>
              In PDF
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  )
}