import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import {
  Alert,
  Button,
  Col,
  Descriptions,
  Drawer,
  Flex,
  InputNumber,
  Modal,
  Row,
  Select,
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
  PhoneOutlined,
  PlusOutlined,
  SendOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useBookingDetail } from '@/features/bookings/hooks/useBookingDetail'
import { useSendDeposit } from '@/features/bookings/hooks/useSendDeposit'
import type { BookingDetailItem } from '@/features/bookings/hooks/useBookingDetail'
// BookingDetailItem được export từ useBookingDetail
import { EditBookingModal } from '@/features/bookings/components/EditBookingModal'
import BookingFolioEditModal from '@/features/bookings/components/BookingFolioEditModal'
import { AddServiceModal } from '@/features/bookings/components/AddServiceModal'
import { AddRoomModal } from '@/components/bookings/AddRoomModal'
import { CheckinImportModal } from '@/features/checkin/components/CheckinImportModal'
import { CheckInModal } from '@/features/checkin/components/CheckInModal'
import type { DashboardRoom } from '@/types/dashboard'
import { CheckoutModal } from '@/features/checkout/components/CheckoutModal'
import { PaymentModal } from '@/features/payment/components/PaymentModal'
import { DocumentActionsMenu } from '@/features/documents/DocumentActionsMenu'
import { DocumentHistoryDrawer } from '@/features/documents/DocumentHistoryDrawer'
import { EarlyLateModal } from '@/features/bookings/components/EarlyLateModal'
import { useCancelBooking } from '@/features/bookings/hooks/useUpdateBooking'
import type { EarlyLateType } from '@/hooks/useAddEarlyLate'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'
import { formatVND } from './bookingDetailShared'
import { formatDate, formatPaymentMethod } from '@/shared/utils/format'
import { BookingRoomCard } from './BookingRoomCard'

// F08: nút thao tác cạnh "Còn lại" cao theo token (40px desktop, 44px màn cảm ứng)
const ACTION_BUTTON_STYLE: React.CSSProperties = { minHeight: 'var(--control-height)' }

interface Props {
  groupId?: string | null
  bookingId?: string | null
  open: boolean
  onClose: () => void
  onEditBooking?: (booking: BookingDetailItem) => void
}

// Drawer chi tiết group booking: thông tin khách, danh sách phòng, thanh toán.
export default function BookingDetailDrawer({ groupId = null, bookingId = null, open, onClose, onEditBooking }: Props) {
  const queryClient = useQueryClient()
  const { message } = useAppFeedback()
  const { isMobile } = useBreakpoint()
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
  const [manualCheckinBookingId, setManualCheckinBookingId] = useState<string | null>(null)
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  // State for folio edit modal
  const [folioEditOpen, setFolioEditOpen] = useState(false)
  const [folioEditBookingId, setFolioEditBookingId] = useState<string | null>(null)
  const [roomPickerOpen, setRoomPickerOpen] = useState(false)
  const [selectedFolioRoomId, setSelectedFolioRoomId] = useState<string | null>(null)
  const [earlyLateOpen, setEarlyLateOpen] = useState(false)
  const [earlyLateDefaultType, setEarlyLateDefaultType] = useState<EarlyLateType>('early')
  const [earlyLateBooking, setEarlyLateBooking] = useState<BookingDetailItem | null>(null)
  const [addServiceOpen, setAddServiceOpen] = useState(false)
  const [addServiceBookingId, setAddServiceBookingId] = useState<string | null>(null)
  const [addRoomOpen, setAddRoomOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  // Giá trị gợi ý: autofill = tổng price_per_night các booking active (KHÔNG hard-code 30%)
  const [depositAmount, setDepositAmount] = useState<number | null>(null)
  const sendDeposit = useSendDeposit()
  const autoFilledGroupIdRef = useRef<string | null>(null)
  const depositEditedRef = useRef(false)

  const suggestedDeposit = useMemo(() => {
    if (!data?.bookings) return 0
    return data.bookings
      .filter((booking) => booking.status !== 'cancelled')
      .reduce((sum, booking) => sum + (booking.price_per_night ?? 0), 0)
  }, [data?.bookings])

  useEffect(() => {
    if (!effectiveGroupId || !data) return
    // Chỉ autofill 1 lần cho mỗi group được mở — không ghi đè khi data refetch
    if (autoFilledGroupIdRef.current === effectiveGroupId) return
    autoFilledGroupIdRef.current = effectiveGroupId
    depositEditedRef.current = false
    if (suggestedDeposit > 0) {
      setDepositAmount(suggestedDeposit)
    }
  }, [effectiveGroupId, data, suggestedDeposit])

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

  // Tìm booking đang check-in tay để build shape DashboardRoom tối thiểu cho CheckInModal.
  // CheckInModal chỉ đọc: room_id, booking_id, guest_name, check_in, check_out — các field
  // còn lại không được component này sử dụng nên để giá trị mặc định an toàn.
  const manualCheckinBooking = data?.bookings.find((b) => b.id === manualCheckinBookingId) ?? null

  const manualCheckinRoom: DashboardRoom | null = manualCheckinBooking
    ? {
        room_id: manualCheckinBooking.room_id,
        room_name: '',
        room_type: '',
        capacity: 0,
        housekeeping_status: 'clean',
        housekeeping_note: null,
        booking_id: manualCheckinBooking.id,
        check_in: manualCheckinBooking.check_in,
        check_out: manualCheckinBooking.check_out,
        status: manualCheckinBooking.status,
        guest_name: manualCheckinBooking.guest_name,
        guests_count: manualCheckinBooking.guests_count,
        customer_phone: null,
        source: null,
        paid: null,
        net_revenue: null,
        price_per_night: null,
        grand_total: manualCheckinBooking.grand_total,
        balance_due: null,
        group_id: effectiveGroupId,
        group_grand_total: null,
        group_balance_due: null,
        group_active_booking_count: null,
        is_last_active_booking: false,
        is_blocked: false,
        block_reason: null,
      }
    : null

  const totalGrandTotal = data?.grand_total ?? 0
  // = groups.grand_total - groups.paid (useBookingDetail) — KHÔNG tự cộng lại từ bookings
  const balanceDue = data?.balance_due ?? 0

  // C4: PaymentModal (form ghi nhận thanh toán đã chuẩn hoá ở Nhóm 4) nhận shape DashboardRoom.
  // Chỉ dùng group_id, booking_id (bắt buộc khi trả thẻ để tính phụ phí 4%) và group_balance_due.
  const firstActiveBooking = data?.bookings.find((b) => b.status !== 'cancelled') ?? null
  const paymentRoom: DashboardRoom | null =
    data && effectiveGroupId
      ? {
          room_id: firstActiveBooking?.room_id ?? '',
          room_name: '',
          room_type: '',
          capacity: 0,
          housekeeping_status: 'clean',
          housekeeping_note: null,
          booking_id: firstActiveBooking?.id ?? null,
          check_in: firstActiveBooking?.check_in ?? null,
          check_out: firstActiveBooking?.check_out ?? null,
          status: firstActiveBooking?.status ?? null,
          guest_name: data.customer_name,
          guests_count: null,
          customer_phone: data.customer_phone ?? null,
          source: null,
          paid: data.paid,
          net_revenue: null,
          price_per_night: null,
          grand_total: totalGrandTotal,
          balance_due: balanceDue,
          group_id: effectiveGroupId,
          group_grand_total: totalGrandTotal,
          group_balance_due: balanceDue,
          group_active_booking_count: null,
          is_last_active_booking: false,
          is_blocked: false,
          block_reason: null,
        }
      : null

  // F08: còn nợ cấp đoàn (balanceDue lấy từ DB) và có đủ dữ liệu mở form thu tiền
  const canCollectPayment = balanceDue > 0 && paymentRoom != null

  const paymentColumns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      render: (v: string) => formatDate(v),
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
      // U-05: hiển thị tiếng Việt (Tiền mặt / Chuyển khoản / Thẻ), giá trị DB giữ nguyên
      render: (v: string | null) => formatPaymentMethod(v),
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
        width={isMobile ? '100%' : 680}
        open={open}
        onClose={onClose}
        // C3: áp token cỡ chữ + vùng bấm cho toàn bộ drawer (xem index.css)
        rootClassName="booking-detail-drawer"
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
              column={isMobile ? 1 : 2}
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
            <Row gutter={[16, 16]} align="top">
              <Col xs={24} md={8}>
                <Statistic
                  title="Tổng hoá đơn"
                  value={totalGrandTotal}
                  formatter={(v) => formatVND(v as number)}
                />
              </Col>
              <Col xs={24} md={8}>
                <Statistic
                  title="Đã thanh toán"
                  value={data.paid}
                  valueStyle={{ color: '#52c41a' }}
                  formatter={(v) => formatVND(v as number)}
                />
              </Col>
              <Col
                xs={24}
                md={8}
                style={{
                  display: 'flex',
                  // C4: số còn nợ ở trên, nút "Thu tiền" + "Sổ folio" xếp ngay bên dưới
                  // (trước đây xếp ngang trong cột 1/3 → nút bị đẩy ra ngoài mép drawer)
                  alignItems: 'stretch',
                  gap: 8,
                  flexDirection: 'column',
                }}
              >
                <Statistic
                  title="Còn lại"
                  value={balanceDue}
                  valueStyle={{ color: balanceDue > 0 ? '#ff4d4f' : '#52c41a' }}
                  formatter={(v) => formatVND(v as number)}
                  style={{ flex: 1 }}
                />
                {/* C4: "Thu tiền" đặt ngay cạnh số còn nợ, mở thẳng form ghi nhận thanh toán.
                    F08: đoàn còn nợ → "Thu tiền" là nút primary, "Sổ folio" lùi về nút thường. */}
                {canCollectPayment && (
                  <Button
                    type="primary"
                    icon={<WalletOutlined />}
                    style={ACTION_BUTTON_STYLE}
                    block={isMobile}
                    onClick={() => setPaymentOpen(true)}
                  >
                    Thu tiền
                  </Button>
                )}
                {/* Nút mở modal folio */}
                {data.bookings.length > 0 && (
                  <Button
                    type={canCollectPayment ? 'default' : 'primary'}
                    icon={<EditOutlined />}
                    style={ACTION_BUTTON_STYLE}
                    block={isMobile}
                    onClick={() => {
                      if (data.bookings.length === 1) {
                        // Chỉ 1 phòng → mở thẳng, không cần hỏi
                        setFolioEditBookingId(data.bookings[0].id)
                        setFolioEditOpen(true)
                      } else {
                        // Nhiều phòng → bắt buộc chọn phòng trước khi mở folio
                        setSelectedFolioRoomId(null)
                        setRoomPickerOpen(true)
                      }
                    }}
                  >
                    Sổ folio
                  </Button>
                )}
              </Col>
            </Row>
            {/* Danh sách phòng */}
            <div>
              <Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
                <Typography.Title level={5} style={{ marginBottom: 0 }}>
                  <CalendarOutlined style={{ marginRight: 8 }} />
                  Danh sách phòng
                </Typography.Title>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setAddRoomOpen(true)}
                  size="small"
                  disabled={!effectiveGroupId}
                >
                  Thêm phòng
                </Button>
              </Flex>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {data.bookings.map((booking) => (
                  <BookingRoomCard
                    key={booking.id}
                    booking={{ ...booking, services: [], discounts: [] }}
                    groupId={effectiveGroupId ?? ''}
                    groupName={data.customer_name}
                    isCancelling={cancelBookingMutation.isPending}
                    onCheckin={(bookingIdToCheckin) => setManualCheckinBookingId(bookingIdToCheckin)}
                    onCheckinImport={() => setCheckinImportOpen(true)}
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
              <Flex
                align={isMobile ? 'stretch' : 'center'}
                justify="space-between"
                gap={8}
                wrap="wrap"
                style={{ marginBottom: 12 }}
              >
                <Typography.Title level={5} style={{ marginBottom: 0 }}>
                  <CreditCardOutlined style={{ marginRight: 8 }} />
                  Lịch sử thanh toán
                </Typography.Title>
                {effectiveGroupId && (
                  <Space.Compact>
                    <InputNumber
                      value={depositAmount}
                      onChange={(v) => {
                        depositEditedRef.current = true
                        setDepositAmount(v)
                      }}
                      min={0}
                      step={50000}
                      placeholder="Số tiền cọc"
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                      parser={(v) => Number(v?.replace(/\./g, '') ?? 0)}
                      addonAfter="đ"
                      style={{ width: 160 }}
                    />
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      loading={sendDeposit.isPending}
                      disabled={!depositAmount || depositAmount <= 0}
                      onClick={() =>
                        sendDeposit.mutate({ groupId: effectiveGroupId, depositAmount: depositAmount! })
                      }
                    >
                      Gửi lại cọc
                    </Button>
                  </Space.Compact>
                )}
              </Flex>
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

      {/* C4: mount khi mở để form lấy đúng số còn nợ mới nhất làm giá trị mặc định */}
      {paymentOpen && paymentRoom && (
        <PaymentModal visible room={paymentRoom} onCancel={() => setPaymentOpen(false)} />
      )}

      {/* Modal chọn phòng trước khi mở Sổ folio — chỉ hiện khi group >1 phòng */}
      <Modal
        title="Chọn phòng để mở Sổ folio"
        open={roomPickerOpen}
        onOk={() => {
          if (selectedFolioRoomId) {
            setFolioEditBookingId(selectedFolioRoomId)
            setRoomPickerOpen(false)
            setFolioEditOpen(true)
          }
        }}
        onCancel={() => {
          setRoomPickerOpen(false)
          setSelectedFolioRoomId(null)
        }}
        okButtonProps={{ disabled: !selectedFolioRoomId }}
        okText="Mở folio"
        cancelText="Huỷ"
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Đoàn này có {data?.bookings.length ?? 0} phòng. Dịch vụ/giảm giá/thanh toán sẽ được ghi vào phòng bạn chọn.
        </Typography.Paragraph>
        <Select
          style={{ width: '100%' }}
          placeholder="Chọn phòng..."
          value={selectedFolioRoomId}
          onChange={(value) => setSelectedFolioRoomId(value)}
          options={data?.bookings.map((booking) => ({
            value: booking.id,
            label: `${booking.room_name ?? booking.room_id} — ${dayjs(booking.check_in).format('DD/MM')} → ${dayjs(booking.check_out).format('DD/MM')}${booking.guest_name ? ` — ${booking.guest_name}` : ''}`,
          }))}
        />
      </Modal>

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

      <CheckInModal
        open={!!manualCheckinBookingId}
        room={manualCheckinRoom}
        onClose={() => setManualCheckinBookingId(null)}
        onSuccess={() => {
          setManualCheckinBookingId(null)
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

      {effectiveGroupId && data && (
        <AddRoomModal
          open={addRoomOpen}
          groupId={effectiveGroupId}
          defaultCheckIn={data.bookings[0]?.check_in}
          defaultCheckOut={data.bookings[0]?.check_out}
          onClose={() => setAddRoomOpen(false)}
        />
      )}
    </>
  )
}

