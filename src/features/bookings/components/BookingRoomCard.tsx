import dayjs from 'dayjs'
import {
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
  CopyOutlined,
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
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { BreakfastSection } from './BreakfastSection'
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
  onCheckinImport?: (bookingId: string) => void
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
  onCheckinImport,
  onCheckout,
  onAddService,
  onEarlyLate,
  onCancel,
  onEdit,
  isCancelling = false,
}: BookingRoomCardProps) {
  const { message } = useAppFeedback()
  const bookingCode = booking.code
  const nights = booking.nights ?? dayjs(booking.check_out).diff(dayjs(booking.check_in), 'day')

  // C3: nút chỉ có icon phải có aria-label và phản hồi rõ ràng sau khi sao chép
  const handleCopyCode = async (code: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      message.success(`Đã sao chép mã ${code}`)
    } catch {
      message.error('Không sao chép được — hãy chọn mã và sao chép thủ công')
    }
  }
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
    <div
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 8,
        padding: '12px 16px',
        background: booking.status === 'cancelled' ? 'var(--surface-sunken)' : 'var(--surface)',
        overflowX: 'hidden',
      }}
    >
        {/* SỬA B-07: trước đây Badge.Ribbon (định vị tuyệt đối góc phải) đè lên nút Sửa.
            Giờ tách hàng header: trái = badge trạng thái, phải = tổng tiền + nút Sửa. */}
        <Flex justify="space-between" align="center" gap={8} wrap style={{ marginBottom: 8 }}>
          <Tag color={STATUS_COLOR[booking.status] ?? 'default'} style={{ marginInlineEnd: 0 }}>
            {STATUS_LABEL[booking.status] ?? booking.status}
          </Tag>
          <Flex gap={8} align="center">
            <Typography.Text strong>{formatVND(booking.grand_total)}</Typography.Text>
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

        <div>
          <div>
            <Typography.Text strong className="booking-emphasis">
              Phòng {booking.room_name ?? booking.room_id}
              {booking.has_early_check_in && (
                <Tag color="orange" style={{ marginLeft: 4 }}>🌅 Nhận sớm</Tag>
              )}
              {booking.has_late_check_out && (
                <Tag color="purple" style={{ marginLeft: 4 }}>🌙 Trả muộn</Tag>
              )}
            </Typography.Text>
            {booking.guest_name && (
              <Typography.Text className="booking-emphasis" style={{ marginLeft: 8 }}>
                — {booking.guest_name}
              </Typography.Text>
            )}
            {bookingCode && (
              <span style={{ marginLeft: 8, whiteSpace: 'nowrap' }}>
                <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
                  {bookingCode}
                </Tag>
                <Tooltip title="Sao chép mã booking">
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => void handleCopyCode(bookingCode)}
                    aria-label="Sao chép mã booking"
                    className="icon-btn"
                  />
                </Tooltip>
              </span>
            )}
            {primaryGuest && (
              <div style={{ marginTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: 'var(--font-size-secondary)', display: 'block' }}>
                  Loại giấy tờ: {primaryGuest.document_type ?? '—'}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 'var(--font-size-secondary)', display: 'block' }}>
                  Số giấy tờ: {isPiiVisible ? (primaryGuest.document_number ?? '—') : '—'}
                </Typography.Text>
              </div>
            )}
            <div style={{ marginTop: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: 'var(--font-size-secondary)' }}>
                {dayjs(booking.check_in).format('DD/MM')} → {dayjs(booking.check_out).format('DD/MM/YYYY')}
                {' '}({nights} đêm)
              </Typography.Text>
            </div>
          </div>
        </div>

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

        {status !== 'cancelled' && (
          <BreakfastSection booking={booking} groupId={groupId} readOnly={isReadOnly} />
        )}

        {booking.note && (
          <Typography.Text type="secondary" style={{ fontSize: 'var(--font-size-secondary)', display: 'block', marginTop: 4 }}>
            📝 {booking.note}
          </Typography.Text>
        )}

        {/* Action buttons — hiển thị có điều kiện theo status */}
        {(status !== 'cancelled') && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
            <Space wrap size="small">
              {/* Check-in */}
              {canCheckin && (
                <>
                  <Button type="primary" size="small" icon={<LoginOutlined />} onClick={() => onCheckin?.(booking.id)}>
                    Check-in
                  </Button>
                  <Button size="small" icon={<FileExcelOutlined />} onClick={() => onCheckinImport?.(booking.id)}>
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

              {/* Nhận sớm / Trả muộn */}
              {canEarlyLate && (
                <Tooltip title="Thêm nhận phòng sớm / trả phòng muộn cho booking này">
                  <Button size="small" icon={<ClockCircleOutlined />} onClick={() => onEarlyLate?.(booking.id)}>
                    Nhận sớm/Trả muộn
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
  )
}
