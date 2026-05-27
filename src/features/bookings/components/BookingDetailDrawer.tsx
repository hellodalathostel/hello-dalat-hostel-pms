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
  HistoryOutlined,
  LoginOutlined,
  PhoneOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useBookingDetail } from '@/features/bookings/hooks/useBookingDetail'
import type { BookingDetailItem } from '@/features/bookings/hooks/useBookingDetail'
// BookingDetailItem được export từ useBookingDetail
import { EditBookingModal } from '@/features/bookings/components/EditBookingModal'
import BookingFolioEditModal from '@/features/bookings/components/BookingFolioEditModal'
import { CheckinImportModal } from '@/features/checkin/components/CheckinImportModal'
import { CheckoutModal } from '@/features/checkout/components/CheckoutModal'
import { BookingActionButtons } from '@/features/bookings/components/BookingActionButtons'
import { DocumentActionsMenu } from '@/features/documents/DocumentActionsMenu'
import { DocumentHistoryDrawer } from '@/features/documents/DocumentHistoryDrawer'
import { EarlyLateModal } from '@/features/bookings/components/EarlyLateModal'
import type { EarlyLateType } from '@/hooks/useAddEarlyLate'

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
  const queryClient = useQueryClient()
  const { data, isLoading } = useBookingDetail(groupId)
  const [editingBooking, setEditingBooking] = useState<BookingDetailItem | null>(null)
  const [checkinImportOpen, setCheckinImportOpen] = useState(false)
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  // State for folio edit modal
  const [folioEditOpen, setFolioEditOpen] = useState(false)
  const [folioEditBookingId, setFolioEditBookingId] = useState<string | null>(null)
  const [earlyLateOpen, setEarlyLateOpen] = useState(false)
  const [earlyLateDefaultType, setEarlyLateDefaultType] = useState<EarlyLateType>('early')
  const [earlyLateBooking, setEarlyLateBooking] = useState<BookingDetailItem | null>(null)

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
        extra={
          data && groupId ? (
            <Space size={8}>
              <Button
                icon={<HistoryOutlined />}
                size="small"
                onClick={() => setHistoryOpen(true)}
              >
                Lịch sử
              </Button>
              <DocumentActionsMenu groupId={groupId} remaining={Math.max(0, balanceDue)} />
            </Space>
          ) : null
        }
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
            <Row gutter={16} align="middle">
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
              <Col span={8} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Statistic
                  title="Còn lại"
                  value={balanceDue}
                  valueStyle={{ color: balanceDue > 0 ? '#ff4d4f' : '#52c41a' }}
                  formatter={(v) => formatVND(v as number)}
                  style={{ flex: 1 }}
                />
                {/* Nút mở modal folio */}
                {data.bookings.length > 0 && (
                  <Button
                    size="small"
                    type="primary"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setFolioEditBookingId(data.bookings[0].id)
                      setFolioEditOpen(true)
                    }}
                  >
                    Sổ folio
                  </Button>
                )}
              </Col>
            </Row>
      {/* Modal chỉnh sửa folio */}
      <BookingFolioEditModal
        open={folioEditOpen}
        onClose={() => setFolioEditOpen(false)}
        bookingId={folioEditBookingId || ''}
        groupId={groupId || ''}
      />

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
                    onCheckin={() => setCheckinImportOpen(true)}
                    onOpenEarlyLate={(type) => {
                      setEarlyLateBooking({ ...booking, services: [], discounts: [] })
                      setEarlyLateDefaultType(type)
                      setEarlyLateOpen(true)
                    }}
                    onEdit={() => {
                      const bookingItem = { ...booking, services: [], discounts: [] }
                      if (onEditBooking) {
                        onEditBooking(bookingItem)
                        return
                      }

                      setEditingBooking(bookingItem)
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

      <CheckinImportModal
        open={checkinImportOpen}
        onClose={() => setCheckinImportOpen(false)}
        onSuccess={() => {
          setCheckinImportOpen(false)

          if (groupId) {
            void queryClient.invalidateQueries({ queryKey: ['booking-detail', groupId] })
          }
        }}
      />

      <CheckoutModal
        bookingId={checkoutBookingId}
        open={Boolean(checkoutBookingId)}
        onClose={() => setCheckoutBookingId(null)}
      />

      <DocumentHistoryDrawer
        groupId={groupId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      <EarlyLateModal
        open={earlyLateOpen}
        booking={earlyLateBooking}
        defaultType={earlyLateDefaultType}
        onClose={() => {
          setEarlyLateOpen(false)
          setEarlyLateBooking(null)
        }}
        onSuccess={() => {
          if (groupId) {
            void queryClient.invalidateQueries({ queryKey: ['booking-detail', groupId] })
          }
        }}
      />
    </>
  )
}

// Card hiển thị một booking trong group
function BookingRoomCard({
  booking,
  onCheckin,
  onOpenEarlyLate,
  onEdit,
}: {
  booking: BookingDetailItem
  onCheckin: () => void
  onOpenEarlyLate: (type: EarlyLateType) => void
  onEdit: () => void
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
                  onClick={() => onOpenEarlyLate('early')}
                >
                  Early Check-in
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<LoginOutlined />}
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
              <>
                <Button
                  size="small"
                  onClick={() => onOpenEarlyLate('early')}
                >
                  Early Check-in
                </Button>
                <Button
                  size="small"
                  onClick={() => onOpenEarlyLate('late')}
                >
                  Late Check-out
                </Button>
                <BookingActionButtons
                  bookingId={booking.id}
                  status={booking.status}
                  size="small"
                  showDetails={false}
                />
              </>
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
            {booking.services.map((s: import('@/features/bookings/hooks/useBookingDetail').BookingServiceItem) => (
              <Tag key={s.id} style={{ marginBottom: 4 }}>
                {s.name} x{s.qty} — {formatVND(s.price * s.qty)}
              </Tag>
            ))}
          </div>
        )}

        {booking.discounts.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {booking.discounts.map((d: import('@/features/bookings/hooks/useBookingDetail').BookingDiscountItem) => (
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
