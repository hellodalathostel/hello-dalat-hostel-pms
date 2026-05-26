// Drawer hiển thị thông tin OTA blocks cho phòng đang blocked
import { CalendarOutlined, ClockCircleOutlined, LinkOutlined, SyncOutlined } from '@ant-design/icons'
import { Badge, Descriptions, Drawer, Empty, Skeleton, Space, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import type { DashboardRoom } from '@/types/dashboard'
import { useRoomOtaBlocks } from '../hooks/useRoomOtaBlocks'

interface BlockedRoomDrawerProps {
  room: DashboardRoom | null
  open: boolean
  onClose: () => void
}

function formatDate(value: string | null): string {
  if (!value) {
    return '-'
  }

  return dayjs(value).format('DD/MM/YYYY')
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-'
  }

  return dayjs(value).format('DD/MM/YYYY HH:mm')
}

function getNights(checkIn: string, checkOut: string): number {
  return dayjs(checkOut).diff(dayjs(checkIn), 'day')
}

// "deluxe_double" → "Deluxe Double"
function formatRoomType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function BlockedRoomDrawer({ room, open, onClose }: BlockedRoomDrawerProps): React.JSX.Element {
  const roomId = room?.room_id?.toString() ?? null
  const { data: blocks, isLoading } = useRoomOtaBlocks(open ? roomId : null)

  const title = room ? `P${room.room_id} — ${formatRoomType(room.room_type)}` : 'Chi tiết phòng'

  return (
    <Drawer
      title={
        <Space>
          <span>{title}</span>
          <Tag color="red">Đóng phòng</Tag>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={420}
      styles={{ body: { padding: '16px 24px' } }}
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !blocks || blocks.length === 0 ? (
        <Empty description="Không có OTA block nào đang active" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {blocks.map((block) => {
            const nights = getNights(block.check_in, block.check_out)
            const isBooking = Boolean(block.ota_booking_num)

            return (
              <div
                key={block.id}
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: 12,
                  background: isBooking ? '#fff7e6' : '#f5f5f5',
                }}
              >
                <Space style={{ marginBottom: 8 }} wrap>
                  <Badge
                    color={isBooking ? 'orange' : 'default'}
                    text={<Typography.Text strong>{block.ota_source}</Typography.Text>}
                  />
                  <Tag color={isBooking ? 'orange' : 'default'}>
                    {isBooking ? 'Booking thật' : 'CLOSED block'}
                  </Tag>
                </Space>

                <Descriptions size="small" column={1} colon>
                  <Descriptions.Item
                    label={
                      <>
                        <CalendarOutlined /> Nhận phòng
                      </>
                    }
                  >
                    {formatDate(block.check_in)}
                  </Descriptions.Item>
                  <Descriptions.Item
                    label={
                      <>
                        <CalendarOutlined /> Trả phòng
                      </>
                    }
                  >
                    {formatDate(block.check_out)}{' '}
                    <Typography.Text type="secondary">({nights} đêm)</Typography.Text>
                  </Descriptions.Item>

                  {block.ota_booking_num ? (
                    <Descriptions.Item
                      label={
                        <>
                          <LinkOutlined /> Mã booking
                        </>
                      }
                    >
                      <Typography.Text copyable>{block.ota_booking_num}</Typography.Text>
                    </Descriptions.Item>
                  ) : null}

                  {block.summary ? (
                    <Descriptions.Item label="Summary">
                      <Typography.Text type="secondary">{block.summary}</Typography.Text>
                    </Descriptions.Item>
                  ) : null}

                  <Descriptions.Item
                    label={
                      <>
                        <ClockCircleOutlined /> Sync lần cuối
                      </>
                    }
                  >
                    <Typography.Text type="secondary">
                      {formatDateTime(block.last_synced_at)}
                    </Typography.Text>
                  </Descriptions.Item>
                </Descriptions>
              </div>
            )
          })}

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            <SyncOutlined /> Dữ liệu đồng bộ tự động mỗi 15 phút từ Booking.com
          </Typography.Text>
        </Space>
      )}
    </Drawer>
  )
}
