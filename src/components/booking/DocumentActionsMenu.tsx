import { useState } from 'react'
import { Button, Dropdown, Modal, InputNumber, DatePicker, Space } from 'antd'
import { FileTextOutlined, DownOutlined, PrinterOutlined, MessageOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import dayjs from 'dayjs'
import { useDocumentGeneratorByGroup } from '@/features/documents/useDocumentGenerator'

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
  const { generateAndPrint, generateAndCopyZalo } = useDocumentGeneratorByGroup({ groupId })

  // State cho modal deposit_request (cần nhập số tiền + deadline)
  const [depositModal, setDepositModal] = useState(false)
  const [depositAmount, setDepositAmount] = useState<number>(Math.round(grandTotal * 0.3))
  const [depositDeadline, setDepositDeadline] = useState(dayjs().add(2, 'day'))

  type DocKind = 'booking_confirmation' | 'deposit_request' | 'deposit_confirmation' | 'invoice' | 'arrival_notice'

  // Helper: generate và in PDF (hook tự fetch data từ DB + ghi log)
  const handlePDF = async (kind: DocKind, opts?: { depositAmount?: number; depositDeadline?: string }) => {
    await generateAndPrint({ kind, bookingId, ...opts })
  }

  // Helper: generate và copy Zalo text (hook tự fetch data từ DB + ghi log)
  const handleZalo = async (kind: DocKind, opts?: { depositAmount?: number; depositDeadline?: string }) => {
    await generateAndCopyZalo({ kind, bookingId, ...opts })
  }

  // Xử lý deposit_request (cần modal nhập thêm)
  const handleDepositRequest = async (format: 'pdf' | 'zalo_text') => {
    const opts = {
      depositAmount,
      depositDeadline: depositDeadline.format('YYYY-MM-DD'),
    }
    if (format === 'pdf') await handlePDF('deposit_request', opts)
    else await handleZalo('deposit_request', opts)
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