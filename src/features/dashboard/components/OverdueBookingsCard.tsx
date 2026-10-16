// src/features/dashboard/components/OverdueBookingsCard.tsx
// Khối "Quá hạn cần xử lý": booking checked-in đã quá ngày trả (ICT).
// Check-out thủ công từng dòng, có hộp xác nhận — KHÔNG tự động, KHÔNG có "check-out tất cả".
import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Button, Card, Flex, Modal, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCheckoutBooking } from '@/features/checkout/hooks/useCheckoutBooking'
import { useRooms } from '@/features/bookings/hooks/useRooms'
import { useOverdueBookings, type OverdueBooking } from '@/features/dashboard/hooks/useOverdueBookings'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'

const vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

function getConfirmContent(row: OverdueBooking): string {
  if (!row.isLastActiveInGroup) {
    return `Check-out phòng ${row.roomId}? Khoản nợ của nhóm sẽ thu khi check-out booking cuối.`
  }
  if (row.remaining > 0) {
    return `Check-out phòng ${row.roomId} và ghi nhận thu ${vndFormatter.format(row.remaining)} tiền mặt hôm nay?`
  }
  return `Check-out phòng ${row.roomId}?`
}

interface OverdueBookingsCardProps {
  /** Mở booking detail hiện có (BookingDetailDrawer ở Dashboard) để gia hạn. */
  onOpenBooking: (bookingId: string) => void
}

export function OverdueBookingsCard({ onOpenBooking }: OverdueBookingsCardProps): React.JSX.Element | null {
  const { isMobile } = useBreakpoint()
  const { data: rows = [] } = useOverdueBookings()
  const { data: rooms = [] } = useRooms(false)
  const checkoutBooking = useCheckoutBooking()
  const [confirmRow, setConfirmRow] = useState<OverdueBooking | null>(null)

  const roomNameById = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms])

  const handleConfirm = async () => {
    if (!confirmRow) return

    // Lỗi đã được useCheckoutBooking báo qua message.error — ở đây không báo lại.
    try {
      if (confirmRow.isLastActiveInGroup) {
        const hasDebt = confirmRow.remaining > 0
        await checkoutBooking.mutateAsync({
          bookingId: confirmRow.bookingId,
          isLastActiveBooking: true,
          // Hai số tiền nhóm đúng như staff đang thấy trên màn hình — DB tự khoá row và đối chiếu.
          expectedGroupGrandTotal: confirmRow.groupGrandTotal,
          expectedGroupPaid: confirmRow.groupPaid,
          ...(hasDebt
            ? { paymentMethod: 'cash' as const, note: 'Thu nốt tiền mặt, check-out bù (quá hạn)' }
            : {}),
        })
      } else {
        await checkoutBooking.mutateAsync({
          bookingId: confirmRow.bookingId,
          isLastActiveBooking: false,
        })
      }
      setConfirmRow(null)
    } catch {
      setConfirmRow(null)
    }
  }

  if (rows.length === 0) {
    return null
  }

  const columns: ColumnsType<OverdueBooking> = [
    {
      title: 'Phòng',
      dataIndex: 'roomId',
      key: 'roomId',
      render: (roomId: string) => {
        const name = roomNameById.get(roomId)
        return (
          <Flex vertical>
            <Typography.Text strong>{roomId}</Typography.Text>
            {name ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {name}
              </Typography.Text>
            ) : null}
          </Flex>
        )
      },
    },
    {
      title: 'Khách',
      dataIndex: 'customerName',
      key: 'customerName',
      render: (name: string | null) => name ?? '—',
    },
    {
      title: 'Ngày trả dự kiến',
      dataIndex: 'checkOut',
      key: 'checkOut',
      render: (checkOut: string) => dayjs(checkOut).format('DD/MM'),
    },
    {
      title: 'Trễ',
      dataIndex: 'daysOverdue',
      key: 'daysOverdue',
      render: (days: number) => <Tag color="red">{days} ngày</Tag>,
    },
    {
      title: 'Còn nợ',
      dataIndex: 'remaining',
      key: 'remaining',
      align: 'right',
      render: (remaining: number) =>
        remaining > 0 ? (
          <Typography.Text type="danger">{vndFormatter.format(remaining)}</Typography.Text>
        ) : (
          <Typography.Text type="success">Đã đủ</Typography.Text>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, row: OverdueBooking) => (
        <Flex gap={8} wrap>
          <Button
            type="primary"
            size="small"
            disabled={checkoutBooking.isPending}
            onClick={() => setConfirmRow(row)}
          >
            Check-out
          </Button>
          <Button size="small" type="link" onClick={() => onOpenBooking(row.bookingId)}>
            Mở booking
          </Button>
        </Flex>
      ),
    },
  ]

  return (
    <Card title={`Quá hạn cần xử lý (${rows.length})`} size="small">
      <Table<OverdueBooking>
        rowKey="bookingId"
        columns={columns}
        dataSource={rows}
        pagination={false}
        size="small"
        scroll={isMobile ? { x: 'max-content' } : undefined}
      />

      <Modal
        open={Boolean(confirmRow)}
        title="Xác nhận check-out"
        okText="Check-out"
        cancelText="Huỷ"
        confirmLoading={checkoutBooking.isPending}
        cancelButtonProps={{ disabled: checkoutBooking.isPending }}
        closable={!checkoutBooking.isPending}
        maskClosable={false}
        onOk={() => void handleConfirm()}
        onCancel={() => setConfirmRow(null)}
      >
        {confirmRow ? getConfirmContent(confirmRow) : null}
      </Modal>
    </Card>
  )
}
