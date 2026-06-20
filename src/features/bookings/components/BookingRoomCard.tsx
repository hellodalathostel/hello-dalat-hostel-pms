import dayjs from 'dayjs'
import {
  Badge,
  Button,
  Flex,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileExcelOutlined,
  LoginOutlined,
  LogoutOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons'
import type {
  BookingDetailItem,
  BookingServiceItem,
  BookingDiscountItem,
} from '@/features/bookings/hooks/useBookingDetail'
import { useVoidBooking } from '@/features/bookings/hooks/useVoidBooking'
import {
  STATUS_COLOR,
  STATUS_LABEL,
  PII_VISIBLE_STATUSES,
  ACTION_STATUSES,
  formatVND,
  type BookingStatus,
} from './bookingDetailShared'

export interface BookingRoomCardProps {
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

// Card hiển thị một booking trong group
export function BookingRoomCard({
  booking,
  groupId,
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
  const { mutate: voidBooking, isPending: isVoiding } = useVoidBooking()

  const handleVoidBooking = () => {
    if (!groupId) {
      return
    }

    Modal.confirm({
      title: 'Xóa booking đã trả phòng',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>
            Booking <strong>{booking.guest_name ?? 'Khách chưa xác định'}</strong> — Phòng {booking.room_id} sẽ bị xóa.
          </p>
          <p style={{ color: '#ff4d4f' }}>
            Doanh thu sẽ được hoàn lại tự động. Hành động này không thể khôi phục.
          </p>
        </div>
      ),
      okText: 'Xác nhận xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: () => {
        voidBooking({
          bookingId: booking.id,
          groupId,
          reason: 'Xóa thủ công bởi owner',
        })
      },
    })
  }

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
          overflowX: 'hidden',
        }}
      >
        <Flex justify="space-between" align="flex-start" wrap>
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
            {booking.code && (
              <Tag color="geekblue" style={{ marginLeft: 8 }}>
                {booking.code}
              </Tag>
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
            {booking.services.map((s: BookingServiceItem) => (
              <Tag key={s.id} style={{ marginBottom: 4 }}>
                {s.name} x{s.qty} — {formatVND(s.price * s.qty)}
              </Tag>
            ))}
          </div>
        )}

        {booking.discounts.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {booking.discounts.map((d: BookingDiscountItem) => (
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
        {(status !== 'cancelled') && (
          <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
            <Space wrap size="small">
              {/* Check-in */}
              {canCheckin && (
                <>
                  <Button type="primary" size="small" icon={<LoginOutlined />} onClick={() => onCheckin?.(booking.id)}>
                    Check-in
                  </Button>
                  <Button size="small" icon={<FileExcelOutlined />} onClick={() => onCheckin?.(booking.id)}>
                    Nhập Excel
                  </Button>
                </>
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

              {/* Xoá booking checked-out — destructive action luôn đặt cuối cùng */}
              {status === 'checked-out' && (
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={isVoiding}
                  onClick={handleVoidBooking}
                >
                  Xóa booking
                </Button>
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
