import { DollarOutlined, InfoCircleOutlined, LoginOutlined, LogoutOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Flex, Space, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { getRoomStatus } from '@/features/dashboard/hooks/useDashboard'
import type { DashboardRoom, RoomStatus } from '@/types/dashboard'
import { BookingActionButtons } from '@/features/bookings/components/BookingActionButtons'

interface RoomCardProps {
  room: DashboardRoom
  onClick?: () => void
  onPaymentClick?: (room: DashboardRoom) => void
  onCheckinClick?: (room: DashboardRoom) => void
  onCheckoutClick?: (room: DashboardRoom) => void
  onDetailsClick?: (room: DashboardRoom) => void
}

const statusColorMap: Record<RoomStatus, string> = {
  vacant: 'green',
  arriving: 'blue',
  occupied: 'purple',
  blocked: 'red',
}

const statusTextMap: Record<RoomStatus, string> = {
  vacant: 'Trống',
  arriving: 'Sắp đến',
  occupied: 'Đang ở',
  blocked: 'Đóng phòng',
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-'
  }

  return dayjs(value).format('DD/MM/YYYY HH:mm')
}

function formatCurrency(value: number | null): string {
  const amount = value ?? 0
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

// "deluxe_double" → "Deluxe Double"
function formatRoomType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function renderActionButtons(
  roomStatus: RoomStatus,
  room: DashboardRoom,
  onCheckinClick?: (room: DashboardRoom) => void,
  onCheckoutClick?: (room: DashboardRoom) => void,
  onDetailsClick?: (room: DashboardRoom) => void,
): React.JSX.Element | null {
  const stopAndCall = (event: React.MouseEvent, fn?: (r: DashboardRoom) => void) => {
    event.stopPropagation()
    fn?.(room)
  }

  if (roomStatus === 'vacant') {
    return (
      <Button
        type="primary"
        size="small"
        icon={<LoginOutlined />}
        onClick={(event) => stopAndCall(event, onCheckinClick)}
      >
        Check-in
      </Button>
    )
  }

  if (roomStatus === 'arriving') {
    return (
      <Space size={4}>
        <Button
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={(event) => stopAndCall(event, onDetailsClick)}
        >
          Details
        </Button>
        <Button
          type="primary"
          size="small"
          icon={<LoginOutlined />}
          onClick={(event) => stopAndCall(event, onCheckinClick)}
        >
          Check-in
        </Button>
      </Space>
    )
  }

  if (roomStatus === 'occupied') {
    return (
      <Space size={4}>
        <Button
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={(event) => stopAndCall(event, onDetailsClick)}
        >
          Details
        </Button>
        <Button
          danger
          size="small"
          icon={<LogoutOutlined />}
          onClick={(event) => stopAndCall(event, onCheckoutClick)}
        >
          Check-out
        </Button>
      </Space>
    )
  }

  return null
}

// Card hiển thị thông tin chi tiết cho từng phòng trên dashboard.
export function RoomCard({
  room,
  onClick,
  onPaymentClick,
  onCheckinClick,
  onCheckoutClick,
  onDetailsClick,
}: RoomCardProps): React.JSX.Element {
  const roomStatus = getRoomStatus(room)
  const isDebtWarning = roomStatus === 'occupied' && (room.balance_due ?? 0) > 0
  const actionButtons = renderActionButtons(roomStatus, room, onCheckinClick, onCheckoutClick, onDetailsClick)

  return (
    <Card
      title={
        <Flex align="center" gap={8} wrap>
          <Typography.Title level={5} style={{ marginBottom: 0 }}>
            P{room.room_id} — {formatRoomType(room.room_type)}
          </Typography.Title>
          <Tag color={statusColorMap[roomStatus]}>{statusTextMap[roomStatus]}</Tag>
        </Flex>
      }
      style={isDebtWarning ? { borderColor: '#f08c00' } : undefined}
      hoverable={Boolean(onClick)}
      onClick={onClick}
    >
      {isDebtWarning ? (
        <Alert
          type="warning"
          showIcon
          message="Phòng đang có công nợ"
          description={
            <Flex justify="space-between" align="center" gap={8} wrap>
              <span>Khách còn nợ: {formatCurrency(room.balance_due)}</span>
              <Button
                type="primary"
                size="small"
                icon={<DollarOutlined />}
                onClick={(event) => {
                  event.stopPropagation()
                  onPaymentClick?.(room)
                }}
              >
                Thanh toán
              </Button>
            </Flex>
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Descriptions size="small" column={1}>
        <Descriptions.Item label="Khách">{room.guest_name ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="Số điện thoại">{room.customer_phone ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="Nhận phòng">{formatDateTime(room.check_in)}</Descriptions.Item>
        <Descriptions.Item label="Trả phòng">{formatDateTime(room.check_out)}</Descriptions.Item>
        <Descriptions.Item label="Tổng tiền">{formatCurrency(room.grand_total)}</Descriptions.Item>
      </Descriptions>

      {actionButtons ? (
        <Flex justify="flex-end" style={{ marginTop: 12 }}>
          {actionButtons}
        </Flex>
      ) : null}

      {/* BookingActionButtons — dùng khi có booking ở trạng thái booked hoặc checked-in */}
      {room.booking_id && (room.status === 'booked' || room.status === 'checked-in') && (
        <div style={{ marginTop: 8 }}>
          <BookingActionButtons
            bookingId={room.booking_id}
            status={room.status}
            onDetails={() => onDetailsClick?.(room)}
            size="small"
          />
        </div>
      )}
    </Card>
  )
}
