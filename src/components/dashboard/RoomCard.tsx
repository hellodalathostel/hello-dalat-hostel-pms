import { DollarOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Flex, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { getRoomStatus } from '@/hooks/useDashboard'
import type { DashboardRoom, RoomStatus } from '@/types/dashboard'

interface RoomCardProps {
  room: DashboardRoom
  onClick?: () => void
  onPaymentClick?: (room: DashboardRoom) => void
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

// Card hiển thị thông tin chi tiết cho từng phòng trên dashboard.
export function RoomCard({ room, onClick, onPaymentClick }: RoomCardProps): React.JSX.Element {
  const roomStatus = getRoomStatus(room)
  const isDebtWarning = roomStatus === 'occupied' && (room.balance_due ?? 0) > 0

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
    </Card>
  )
}
