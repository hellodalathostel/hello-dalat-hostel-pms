import { useState } from 'react'
import dayjs from 'dayjs'
import {
  Alert,
  Badge,
  Button,
  Col,
  Descriptions,
  Drawer,
  Flex,
  Popconfirm,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CalendarOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  EditOutlined,
  HistoryOutlined,
  LoginOutlined,
  LogoutOutlined,
  PhoneOutlined,
  PlusOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useBookingDetail } from '@/features/bookings/hooks/useBookingDetail'
import type { BookingDetailItem } from '@/features/bookings/hooks/useBookingDetail'
// BookingDetailItem được export từ useBookingDetail
import { EditBookingModal } from '@/features/bookings/components/EditBookingModal'
import BookingFolioEditModal from '@/features/bookings/components/BookingFolioEditModal'
import { AddServiceModal } from '@/features/bookings/components/AddServiceModal'
import { CheckinImportModal } from '@/features/checkin/components/CheckinImportModal'
import { CheckoutModal } from '@/features/checkout/components/CheckoutModal'
import { DocumentActionsMenu } from '@/features/documents/DocumentActionsMenu'
import { DocumentHistoryDrawer } from '@/features/documents/DocumentHistoryDrawer'
import { EarlyLateModal } from '@/features/bookings/components/EarlyLateModal'
import { useCancelBooking } from '@/features/bookings/hooks/useUpdateBooking'
import type { EarlyLateType } from '@/hooks/useAddEarlyLate'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

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

// PII chỉ hiển thị khi khách đã check-in hoặc đã check-out
const PII_VISIBLE_STATUSES = ['checked-in', 'checked-out'] as const

type BookingStatus = 'booked' | 'checked-in' | 'checked-out' | 'cancelled'

const ACTION_STATUSES = {
  canCheckin: ['booked'] as BookingStatus[],
  canCheckout: ['checked-in'] as BookingStatus[],
  canAddService: ['checked-in'] as BookingStatus[],
  canEarlyLate: ['checked-in'] as BookingStatus[],
  canCancel: ['booked'] as BookingStatus[],
} as const

function formatVND(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

interface Props {
  groupId?: string | null
  bookingId?: string | null
  open: boolean
  onClose: () => void
  onEditBooking?: (booking: BookingDetailItem) => void
}

interface BookingRoomCardProps {
  booking: BookingDetailItem
  groupId: string
  onCheckin?: (bookingId: string) => void
  onCheckout?: (bookingId: string) => void
  onAddService?: (bookingId: string) => void
  onEarlyLate?: (bookingId: string) => void
  onCancel?: (bookingId: string) => void
  onEdit?: () => void
  isCancelling?: boolean
}

// Drawer chi tiết group booking: thông tin khách, danh sách phòng, thanh toán.
export default function BookingDetailDrawer({ groupId = null, bookingId = null, open, onClose, onEditBooking }: Props) {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()
  const cancelBookingMutation = useCancelBooking()
  const { data: resolvedGroupId, isLoading: isResolvingGroupId, isError: isResolvingError } = useQuery({
    queryKey: ['booking-group-id', bookingId],
    enabled: open && !groupId && Boolean(bookingId),
    staleTime: 30 * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!bookingId) {
        return null
      }

      const { data: bookingRow, error } = await supabase
        .from('bookings')
        .select('group_id')
        .eq('id', bookingId)
        .single()

      if (error) {
        throw error
      }

      return bookingRow.group_id ?? null
    },
  })

  const effectiveGroupId = groupId ?? resolvedGroupId ?? null
  const { data, isLoading: isLoadingDetail, isError: isDetailError } = useBookingDetail(effectiveGroupId)
  const isLoading = isResolvingGroupId || isLoadingDetail
  const hasNoInput = !groupId && !bookingId
  const shouldShowResolveError = open && !hasNoInput && !isLoading && (isResolvingError || isDetailError || !data)
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
  const [addServiceOpen, setAddServiceOpen] = useState(false)
  const [addServiceBookingId, setAddServiceBookingId] = useState<string | null>(null)

  const handleCancelBooking = (bookingIdToCancel: string) => {
    cancelBookingMutation.mutate(bookingIdToCancel, {
      onSuccess: () => {
        message.success('Đã huỷ booking')
        if (effectiveGroupId) {
          void queryClient.invalidateQueries({ queryKey: ['booking-detail', effectiveGroupId] })
        }
      },
      onError: (error) => {
        const errorMessage = error instanceof Error ? error.message : 'Không thể huỷ booking'
        message.error(`Huỷ thất bại: ${errorMessage}`)
      },
    })
  }

  const totalGrandTotal = data?.grand_total ?? 0
  const balanceDue = data?.balance_due ?? 0

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
          data && effectiveGroupId ? (
            <Space size={8}>
              <Button
                icon={<HistoryOutlined />}
                size="small"
                onClick={() => setHistoryOpen(true)}
              >
                Lịch sử
              </Button>
              <DocumentActionsMenu groupId={effectiveGroupId} remaining={Math.max(0, balanceDue)} />
            </Space>
          ) : null
        }
        destroyOnClose
      >
        {isLoading && <Skeleton active paragraph={{ rows: 8 }} />}

        {shouldShowResolveError && (
          <Alert
            type="error"
            showIcon
            message="Không tìm thấy thông tin booking"
            description="Vui lòng tải lại trang hoặc kiểm tra lại booking đã chọn."
            style={{ marginBottom: 16 }}
          />
        )}

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
                    groupId={effectiveGroupId ?? ''}
                    isCancelling={cancelBookingMutation.isPending}
                    onCheckin={() => setCheckinImportOpen(true)}
                    onCheckout={(bookingIdToCheckout) => {
                      setCheckoutBookingId(bookingIdToCheckout)
                    }}
                    onAddService={(bookingIdToEditFolio) => {
                      setAddServiceBookingId(bookingIdToEditFolio)
                      setAddServiceOpen(true)
                    }}
                    onEarlyLate={(bookingIdForEarlyLate) => {
                      const matchedBooking = data.bookings.find((item) => item.id === bookingIdForEarlyLate) ?? booking
                      setEarlyLateBooking({ ...matchedBooking, services: [], discounts: [] })
                      setEarlyLateDefaultType('early')
                      setEarlyLateOpen(true)
                    }}
                    onCancel={(bookingIdToCancel) => {
                      handleCancelBooking(bookingIdToCancel)
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

      {/* Modal chỉnh sửa folio */}
      <BookingFolioEditModal
        open={folioEditOpen}
        onClose={() => setFolioEditOpen(false)}
        bookingId={folioEditBookingId || ''}
        groupId={effectiveGroupId || ''}
      />

      {addServiceBookingId && (
        <AddServiceModal
          open={addServiceOpen}
          bookingId={addServiceBookingId}
          onClose={() => {
            setAddServiceOpen(false)
            setAddServiceBookingId(null)
          }}
          onSuccess={() => {
            // folio query đã được invalidate trong useAddService
            setAddServiceOpen(false)
            setAddServiceBookingId(null)
          }}
        />
      )}

      {/* Modal sửa/huỷ booking */}
      {editingBooking && effectiveGroupId && (
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

          if (effectiveGroupId) {
            void queryClient.invalidateQueries({ queryKey: ['booking-detail', effectiveGroupId] })
          }
        }}
      />

      <CheckoutModal
        bookingId={checkoutBookingId}
        open={Boolean(checkoutBookingId)}
        onClose={() => setCheckoutBookingId(null)}
      />

      <DocumentHistoryDrawer
        groupId={effectiveGroupId}
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
          if (effectiveGroupId) {
            void queryClient.invalidateQueries({ queryKey: ['booking-detail', effectiveGroupId] })
          }
        }}
      />
    </>
  )
}

// Card hiển thị một booking trong group
function BookingRoomCard({
  booking,
  groupId: _groupId,
  onCheckin,
  onCheckout,
  onAddService,
  onEarlyLate,
  onCancel,
  onEdit,
  isCancelling = false,
}: BookingRoomCardProps) {
  const nights = booking.nights ?? dayjs(booking.check_out).diff(dayjs(booking.check_in), 'day')
  const isPiiVisible = (PII_VISIBLE_STATUSES as readonly string[]).includes(booking.status)
  const primaryGuest = booking.booking_guests?.find((guest) => guest.is_primary)?.customers ?? null
  const status = booking.status as BookingStatus
  const canCheckin = ACTION_STATUSES.canCheckin.includes(status)
  const canCheckout = ACTION_STATUSES.canCheckout.includes(status)
  const canAddService = ACTION_STATUSES.canAddService.includes(status)
  const canEarlyLate = ACTION_STATUSES.canEarlyLate.includes(status)
  const canCancel = ACTION_STATUSES.canCancel.includes(status)
  const isReadOnly = status === 'checked-out' || status === 'cancelled'

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
            <Typography.Text strong>
              Phòng {booking.room_name ?? booking.room_id}
              {booking.has_early_check_in && (
                <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>🌅 Early</Tag>
              )}
              {booking.has_late_check_out && (
                <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>🌙 Late</Tag>
              )}
            </Typography.Text>
            {booking.guest_name && (
              <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                — {booking.guest_name}
              </Typography.Text>
            )}
            {primaryGuest && (
              <div style={{ marginTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  Loại giấy tờ: {primaryGuest.document_type ?? '—'}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  Số giấy tờ: {isPiiVisible ? (primaryGuest.document_number ?? '—') : '—'}
                </Typography.Text>
              </div>
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
            {onEdit && !isReadOnly && (
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

        {/* Action buttons — hiển thị có điều kiện theo status */}
        {!isReadOnly && (
          <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
            <Space wrap size="small">
              {/* Check-in */}
              {canCheckin && (
                <Button type="primary" size="small" icon={<LoginOutlined />} onClick={() => onCheckin?.(booking.id)}>
                  Check-in
                </Button>
              )}

              {/* Check-out */}
              {canCheckout && (
                <Button type="primary" size="small" icon={<LogoutOutlined />} onClick={() => onCheckout?.(booking.id)}>
                  Check-out
                </Button>
              )}

              {/* Thêm dịch vụ */}
              {canAddService && (
                <Button size="small" icon={<PlusOutlined />} onClick={() => onAddService?.(booking.id)}>
                  Dịch vụ
                </Button>
              )}

              {/* Early / Late */}
              {canEarlyLate && (
                <Tooltip title="Mở modal Early/Late cho booking này">
                  <Button size="small" icon={<ClockCircleOutlined />} onClick={() => onEarlyLate?.(booking.id)}>
                    Early/Late
                  </Button>
                </Tooltip>
              )}

              {/* Huỷ booking */}
              {canCancel && (
                <Popconfirm
                  title="Huỷ booking này?"
                  description="Thao tác này không thể hoàn tác."
                  okText="Huỷ booking"
                  cancelText="Đóng"
                  okButtonProps={{ danger: true, loading: isCancelling }}
                  onConfirm={() => onCancel?.(booking.id)}
                >
                  <Button size="small" danger icon={<StopOutlined />}>
                    Huỷ
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </div>
        )}

        {/* Badge trạng thái khi read-only */}
        {isReadOnly && (
          <div style={{ marginTop: 8 }}>
            <Tag color={status === 'checked-out' ? 'default' : 'red'}>
              {status === 'checked-out' ? 'Đã trả phòng' : 'Đã huỷ'}
            </Tag>
          </div>
        )}
      </div>
    </Badge.Ribbon>
  )
}
