// src/features/documents/DocumentActionsMenu.tsx
// Dropdown menu tích hợp vào GroupDetailDrawer hoặc BookingListPanel
// Dùng useDocumentGenerator để generate + log tài liệu

import { useState } from 'react'
import {
  Dropdown,
  Button,
  Modal,
  Input,
  DatePicker,
  InputNumber,
  Space,
  Typography,
  Divider,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  PrinterOutlined,
  MessageOutlined,
  FileTextOutlined,
  DownOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useDocumentGeneratorByGroup as useDocumentGenerator } from './useDocumentGenerator'
import { DOC_KIND_LABELS, type DocKind } from './documentTemplates'

const { Text } = Typography

interface Props {
  groupId: string
  /** Nếu remaining > 0, hiển thị thêm các doc deposit */
  remaining?: number
}

interface DepositOptions {
  amount?: number
  deadline?: string
}

export function DocumentActionsMenu({ groupId, remaining = 0 }: Props) {
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [pendingKind, setPendingKind] = useState<DocKind | null>(null)
  const [pendingFormat, setPendingFormat] = useState<'print' | 'zalo'>('print')
  const [depositOpts, setDepositOpts] = useState<DepositOptions>({})
  const [zaloPreviewOpen, setZaloPreviewOpen] = useState(false)

  const { isGenerating, zaloText, clearZaloText, generateAndPrint, generateAndCopyZalo } =
    useDocumentGenerator({ groupId })

  // Các loại doc luôn có
  const alwaysItems: { kind: DocKind; icon: React.ReactNode }[] = [
    { kind: 'booking_confirmation', icon: <FileTextOutlined /> },
    { kind: 'arrival_notice', icon: <FileTextOutlined /> },
    { kind: 'invoice', icon: <FileTextOutlined /> },
  ]

  // Deposit items chỉ khi còn nợ
  const depositItems: { kind: DocKind; icon: React.ReactNode }[] = remaining > 0
    ? [
        { kind: 'deposit_request', icon: <FileTextOutlined /> },
        { kind: 'deposit_confirmation', icon: <FileTextOutlined /> },
      ]
    : []

  /** Trigger generate — nếu là deposit_request thì mở modal nhập số tiền cọc */
  async function triggerGenerate(kind: DocKind, format: 'print' | 'zalo') {
    if (kind === 'deposit_request') {
      setPendingKind(kind)
      setPendingFormat(format)
      setDepositModalOpen(true)
      return
    }

    if (format === 'print') {
      await generateAndPrint({ kind })
    } else {
      await generateAndCopyZalo({ kind })
      setZaloPreviewOpen(true)
    }
  }

  /** Xác nhận deposit options từ modal */
  async function confirmDepositGenerate() {
    if (!pendingKind) return
    setDepositModalOpen(false)

    if (pendingFormat === 'print') {
      await generateAndPrint({
        kind: pendingKind,
        depositAmount: depositOpts.amount,
        depositDeadline: depositOpts.deadline,
      })
    } else {
      await generateAndCopyZalo({
        kind: pendingKind,
        depositAmount: depositOpts.amount,
        depositDeadline: depositOpts.deadline,
      })
      setZaloPreviewOpen(true)
    }
  }

  // Xây dropdown menu items
  const buildSubItems = (
    kind: DocKind,
    label: string,
    icon: React.ReactNode
  ): NonNullable<MenuProps['items']>[number] => ({
    key: kind,
    icon,
    label,
    children: [
      {
        key: `${kind}__print`,
        icon: <PrinterOutlined />,
        label: 'In / Tải PDF',
        onClick: () => triggerGenerate(kind, 'print'),
      },
      {
        key: `${kind}__zalo`,
        icon: <MessageOutlined />,
        label: 'Gửi Zalo',
        onClick: () => triggerGenerate(kind, 'zalo'),
      },
    ],
  })

  const menuItems: MenuProps['items'] = [
    ...alwaysItems.map(({ kind, icon }) =>
      buildSubItems(kind, DOC_KIND_LABELS[kind], icon)
    ),
    ...(depositItems.length > 0
      ? [{ type: 'divider' as const }, ...depositItems.map(({ kind, icon }) =>
          buildSubItems(kind, DOC_KIND_LABELS[kind], icon)
        )]
      : []),
  ]

  return (
    <>
      {/* Dropdown trigger */}
      <Dropdown
        menu={{ items: menuItems }}
        trigger={['click']}
        disabled={isGenerating}
      >
        <Button
          icon={<FileTextOutlined />}
          loading={isGenerating}
        >
          Tài liệu <DownOutlined />
        </Button>
      </Dropdown>

      {/* Modal nhập thông tin đặt cọc */}
      <Modal
        title="Thông tin đặt cọc"
        open={depositModalOpen}
        onOk={confirmDepositGenerate}
        onCancel={() => setDepositModalOpen(false)}
        okText="Tạo tài liệu"
        cancelText="Huỷ"
        confirmLoading={isGenerating}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text type="secondary">Số tiền cọc (để trống = 30% tổng tiền)</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 4 }}
              placeholder="VD: 500000"
              min={0}
              step={100000}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(v) => Number(v?.replace(/\./g, '') ?? 0)}
              value={depositOpts.amount}
              onChange={(v) => setDepositOpts((o) => ({ ...o, amount: v ?? undefined }))}
              addonAfter="đ"
            />
          </div>
          <div>
            <Text type="secondary">Hạn thanh toán cọc (để trống = "trong vòng 24h")</Text>
            <DatePicker
              style={{ width: '100%', marginTop: 4 }}
              format="DD/MM/YYYY"
              value={depositOpts.deadline ? dayjs(depositOpts.deadline) : null}
              onChange={(d) =>
                setDepositOpts((o) => ({
                  ...o,
                  deadline: d ? d.format('YYYY-MM-DD') : undefined,
                }))
              }
            />
          </div>
        </Space>
      </Modal>

      {/* Modal preview Zalo text */}
      <Modal
        title="Text Zalo đã copy"
        open={zaloPreviewOpen}
        footer={
          <Button
            icon={<CopyOutlined />}
            onClick={() => {
              if (zaloText) navigator.clipboard.writeText(zaloText)
            }}
          >
            Copy lại
          </Button>
        }
        onCancel={() => {
          setZaloPreviewOpen(false)
          clearZaloText()
        }}
        width={520}
      >
        <Input.TextArea
          value={zaloText ?? ''}
          rows={14}
          readOnly
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
        <Divider style={{ margin: '8px 0' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Text đã được copy vào clipboard. Paste vào Zalo để gửi cho khách.
        </Text>
      </Modal>
    </>
  )
}
