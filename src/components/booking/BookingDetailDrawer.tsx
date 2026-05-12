import { useState } from 'react'
import dayjs from 'dayjs'
import {
  Badge,
  Button,
  Col,
  Descriptions,
  Drawer,
  Flex,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  CalendarOutlined,
  CreditCardOutlined,
  EditOutlined,
  LoginOutlined,
  LogoutOutlined,
  PhoneOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useBookingDetail } from '@/hooks/useBookingDetail'
import type { BookingDetailItem } from '@/hooks/useBookingDetail'
// BookingDetailItem được export từ useBookingDetail
import { EditBookingModal } from '@/components/EditBookingModal'
import { CheckInModal } from '@/components/checkin/CheckInModal'
import { CheckoutModal } from '@/components/checkout/CheckoutModal'

// Map trạng thái sang màu Ant Design Tag
const STATUS_COLOR: Record<string, string> = {
  booked: 'blue',
  'checked-in': 'green',
  'checked-out': 'default',
  cancelled: 'red',
}

const STATUS_LABEL: Record<string, string> = {
  booked: 'Đã đặt',
  'checked-in': 'Đang ở',
  'checked-out': 'Đã trả phòng',
  cancelled: 'Đã huỷ',
}

function formatVND(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

interface Props {
  groupId: string | null
  open: boolean
  onClose: () => void
  onEditBooking?: (booking: BookingDetailItem) => void
}

// Drawer chi tiết group booking: thông tin khách, danh sách phòng, thanh toán.
export default function BookingDetailDrawer({ groupId, open, onClose, onEditBooking }: Props) {
  const { data, isLoading } = useBookingDetail(groupId)
  const [editingBooking, setEditingBooking] = useState<BookingDetailItem | null>(null)
  const [checkinBookingId, setCheckinBookingId] = useState<string | null>(null)
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null)

  // Tổng grand_total tất cả bookings chưa cancelled
  const totalGrandTotal = (data?.bookings ?? [])
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + (b.grand_total ?? 0), 0)

  const balanceDue = totalGrandTotal - (data?.paid ?? 0)

  const paymentColumns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      key: 'amount',
      render: (v: number) => formatVND(v),
    },
    {
      title: 'Phương thức',
      dataIndex: 'method',
      key: 'method',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      key: 'note',
      render: (v: string | null) => v ?? '—',
    },
  ]

  return (
    <>
      <Drawer
        title="Chi tiết Booking"
        placement="right"
        width={680}
        open={open}
        onClose={onClose}
        destroyOnClose
      >
        {isLoading && <Skeleton active paragraph={{ rows: 8 }} />}

        {!isLoading && data && (
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            {/* Thông tin khách hàng */}
            <Descriptions
              title={
                <Flex align="center" gap={8}>
                  <UserOutlined />
                  <span>{data.customer_name}</span>
                  {data.ota_booking_number && (
                    <Tag color="orange">#{data.ota_booking_number}</Tag>
                  )}
                </Flex>
              }
              bordered
              size="small"
              column={2}
            >
              {data.customer_phone && (
                <Descriptions.Item label={<><PhoneOutlined /> SĐT</>}>
                  {data.customer_phone}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Nguồn">
                {data.source ?? '—'}
              </Descriptions.Item>
              {data.channel_fee_rate > 0 && (
                <Descriptions.Item label="Phí kênh">
                  {(data.channel_fee_rate * 100).toFixed(0)}%
                </Descriptions.Item>
              )}
              {data.customer_note && (
                <Descriptions.Item label="Ghi chú" span={2}>
                  {data.customer_note}
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Tổng quan tài chính */}
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="Tổng hoá đơn"
                  value={totalGrandTotal}
                  formatter={(v) => formatVND(v as number)}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Đã thanh toán"
                  value={data.paid}
                  valueStyle={{ color: '#52c41a' }}
                  formatter={(v) => formatVND(v as number)}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Còn lại"
                  value={balanceDue}
                  valueStyle={{ color: balanceDue > 0 ? '#ff4d4f' : '#52c41a' }}
                  formatter={(v) => formatVND(v as number)}
                />
              </Col>
            </Row>

            {/* Danh sách phòng */}
            <div>
              <Typography.Title level={5} style={{ marginBottom: 12 }}>
                <CalendarOutlined style={{ marginRight: 8 }} />
                Danh sách phòng
              </Typography.Title>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {data.bookings.map((booking) => (
                  <BookingRoomCard
                    key={booking.id}
                    booking={{ ...booking, services: [], discounts: [] }}
                    onEdit={() => {
                      const bookingItem = { ...booking, services: [], discounts: [] }
                      if (onEditBooking) {
                        onEditBooking(bookingItem)
                        return
                      }

                      setEditingBooking(bookingItem)
                    }}
                    onCheckin={() => setCheckinBookingId(booking.id)}
                    onCheckout={() => {
                      setCheckoutBookingId(booking.id)
                    }}
                  />
                ))}
              </Space>
            </div>

            {/* Lịch sử thanh toán */}
            <div>
              <Typography.Title level={5} style={{ marginBottom: 12 }}>
                <CreditCardOutlined style={{ marginRight: 8 }} />
                Lịch sử thanh toán
              </Typography.Title>
              {data.payments.length === 0 ? (
                <Typography.Text type="secondary">Chưa có thanh toán nào.</Typography.Text>
              ) : (
                <Table
                  dataSource={data.payments}
                  columns={paymentColumns}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              )}
            </div>
          </Space>
        )}
      </Drawer>

      {/* Modal sửa/huỷ booking */}
      {editingBooking && groupId && (
        <EditBookingModal
          booking={editingBooking}
          onClose={() => setEditingBooking(null)}
          onSuccess={() => setEditingBooking(null)}
        />
      )}

      {checkinBookingId && (
        <CheckInModal
          isOpen={Boolean(checkinBookingId)}
          onClose={() => setCheckinBookingId(null)}
          bookingId={checkinBookingId}
        />
      )}

      <CheckoutModal
        bookingId={checkoutBookingId}
        open={Boolean(checkoutBookingId)}
        onClose={() => setCheckoutBookingId(null)}
      />
    </>
  )
}

// Card hiển thị một booking trong group
function BookingRoomCard({
  booking,
  onEdit,
  onCheckin,
  onCheckout,
}: {
  booking: BookingDetailItem
  onEdit: () => void
  onCheckin: () => void
  onCheckout: () => void
}) {
  const nights = booking.nights ?? dayjs(booking.check_out).diff(dayjs(booking.check_in), 'day')

  return (
    <Badge.Ribbon
      text={STATUS_LABEL[booking.status] ?? booking.status}
      color={STATUS_COLOR[booking.status] ?? 'default'}
    >
      <div
        style={{
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: '12px 16px',
          background: booking.status === 'cancelled' ? '#fafafa' : '#fff',
        }}
      >
        <Flex justify="space-between" align="flex-start">
          <div>
            <Typography.Text strong>Phòng {booking.room_id}</Typography.Text>
            {booking.guest_name && (
              <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                — {booking.guest_name}
              </Typography.Text>
            )}
            <div style={{ marginTop: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {dayjs(booking.check_in).format('DD/MM')} → {dayjs(booking.check_out).format('DD/MM/YYYY')}
                {' '}({nights} đêm)
              </Typography.Text>
            </div>
          </div>

          <Flex gap={8} align="center">
            <div style={{ textAlign: 'right' }}>
              <Typography.Text strong>{formatVND(booking.grand_total)}</Typography.Text>
            </div>

            {booking.status === 'booked' && (
              <>
                <Button
                  size="small"
                  icon={<LoginOutlined />}
                  type="primary"
                  onClick={onCheckin}
                >
                  Check-in
                </Button>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={onEdit}
                >
                  Sửa
                </Button>
              </>
            )}

            {booking.status === 'checked-in' && (
              <Button
                size="small"
                icon={<LogoutOutlined />}
                danger
                onClick={onCheckout}
              >
                Checkout
              </Button>
            )}

            {booking.status !== 'checked-out' &&
              booking.status !== 'cancelled' &&
              booking.status !== 'booked' &&
              booking.status !== 'checked-in' && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={onEdit}
              >
                Sửa
              </Button>
            )}
          </Flex>
        </Flex>

        {booking.services.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {booking.services.map((s: import('@/hooks/useBookingDetail').BookingServiceItem) => (
              <Tag key={s.id} style={{ marginBottom: 4 }}>
                {s.name} x{s.qty} — {formatVND(s.price * s.qty)}
              </Tag>
            ))}
          </div>
        )}

        {booking.discounts.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {booking.discounts.map((d: import('@/hooks/useBookingDetail').BookingDiscountItem) => (
              <Tag key={d.id} color="green" style={{ marginBottom: 4 }}>
                Giảm {formatVND(d.amount)}{d.description ? ` — ${d.description}` : ''}
              </Tag>
            ))}
          </div>
        )}

        {booking.note && (
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            📝 {booking.note}
          </Typography.Text>
        )}
      </div>
    </Badge.Ribbon>
  )
}
