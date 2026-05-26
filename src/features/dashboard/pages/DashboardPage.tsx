import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Col, Flex, Row, Spin, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { CheckinImportModal } from '@/features/checkin/components/CheckinImportModal'
import { QuickCheckoutModal, type CheckoutTarget } from '@/features/checkout/components/QuickCheckoutModal'
import { RoomCard } from '@/features/dashboard/components/RoomCard'
import { BlockedRoomDrawer } from '@/features/dashboard/components/BlockedRoomDrawer'
import { PaymentModal } from '@/features/payment/components/PaymentModal'
import { StatsBar } from '@/features/dashboard/components/StatsBar'
import { getRoomStatus, useDashboard } from '@/features/dashboard/hooks/useDashboard'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { DashboardRoom, DashboardStats } from '@/types/dashboard'

const initialStats: DashboardStats = {
  vacant: 0,
  arriving: 0,
  occupied: 0,
  blocked: 0,
  debt: 0,
}

// Trang dashboard tổng quan: hiển thị thống kê và danh sách phòng theo thời gian thực.
export default function Dashboard(): React.JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()
  const { data: rooms = [], isLoading, isFetching, error } = useDashboard()
  const [selectedRoom, setSelectedRoom] = useState<DashboardRoom | null>(null)
  const [detailsRoom, setDetailsRoom] = useState<DashboardRoom | null>(null)
  const [isCheckInVisible, setIsCheckInVisible] = useState(false)
  const [isPaymentVisible, setIsPaymentVisible] = useState(false)
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null)

  const stats = useMemo<DashboardStats>(() => {
    return rooms.reduce<DashboardStats>((accumulator, room) => {
      const status = getRoomStatus(room)
      accumulator[status] += 1

      if (status === 'occupied' && (room.balance_due ?? 0) > 0) {
        accumulator.debt += 1
      }

      return accumulator
    }, { ...initialStats })
  }, [rooms])

  const handleCloseImportModal = useCallback(() => {
    setIsCheckInVisible(false)
    if (!checkoutTarget && !isPaymentVisible) {
      setSelectedRoom(null)
    }
  }, [checkoutTarget, isPaymentVisible])

  const handleCloseCheckOutModal = useCallback(() => {
    setCheckoutTarget(null)
    if (!isCheckInVisible && !isPaymentVisible) {
      setSelectedRoom(null)
    }
  }, [isCheckInVisible, isPaymentVisible])

  const handleClosePaymentModal = useCallback(() => {
    setIsPaymentVisible(false)
    if (!isCheckInVisible && !checkoutTarget) {
      setSelectedRoom(null)
    }
  }, [isCheckInVisible, checkoutTarget])

  const handlePaymentClick = useCallback((room: DashboardRoom) => {
    setSelectedRoom(room)
    setIsPaymentVisible(true)
  }, [])

  const handleDetailsClick = useCallback((room: DashboardRoom) => {
    setDetailsRoom(room)
  }, [])

  const handleRoomClick = (room: DashboardRoom) => {
    if (room.status === 'booked') {
      if (!room.booking_id) {
        notification.error({
          message: 'Thiếu dữ liệu booking',
          description: 'Không thể mở check-in vì thiếu booking_id.',
        })
        return
      }

      setSelectedRoom(room)
      setIsCheckInVisible(true)
      return
    }

    if (room.status === 'checked-in') {
      if (!room.booking_id || !room.group_id) {
        notification.error({
          message: 'Thiếu dữ liệu booking',
          description: 'Không thể mở check-out vì thiếu booking_id hoặc group_id.',
        })
        return
      }

      setSelectedRoom(room)
      setCheckoutTarget({
        bookingId: room.booking_id,
        groupId: room.group_id,
        bookingIds: [room.booking_id],
        roomNumber: room.room_name || room.room_id,
        guestName: room.guest_name || 'Khach',
        checkIn: room.check_in || dayjs().format('YYYY-MM-DD'),
        checkOut: room.check_out || dayjs().format('YYYY-MM-DD'),
        grandTotal: room.grand_total ?? 0,
        paid: room.paid ?? 0,
      })
      return
    }

    if (getRoomStatus(room) === 'vacant') {
      navigate(`/new-booking?roomId=${room.room_id}&checkIn=${dayjs().format('YYYY-MM-DD')}`)
    }
  }

  const handleRefresh = async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'today'] })
    } catch (refreshError) {
      notification.error({
        message: 'Làm mới thất bại',
        description: refreshError instanceof Error ? refreshError.message : 'Không thể làm mới dữ liệu',
      })
    }
  }

  useEffect(() => {
    if (!error) {
      return
    }

    notification.error({
      message: 'Không thể tải dashboard',
      description: error.message,
    })
  }, [error, notification])

  return (
    <div className="page-grid">
      <Flex justify="space-between" align="center" gap={12} wrap>
        <Typography.Title level={2} style={{ margin: 0 }}>
          Dashboard tổng quan
        </Typography.Title>

        <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={isFetching}>
          Làm mới
        </Button>
      </Flex>

      <StatsBar stats={stats} />

      <Spin spinning={isLoading || isFetching}>
        <Row gutter={[16, 16]}>
          {rooms.map((room) => (
            <Col key={room.room_id} xs={24} md={12} xl={8}>
              <RoomCard
                room={room}
                onClick={() => handleRoomClick(room)}
                onPaymentClick={handlePaymentClick}
                onCheckinClick={handleRoomClick}
                onCheckoutClick={handleRoomClick}
                onDetailsClick={handleDetailsClick}
              />
            </Col>
          ))}
        </Row>
      </Spin>

      {selectedRoom ? (
        <CheckinImportModal
          open={isCheckInVisible}
          onClose={handleCloseImportModal}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['bookings'] })
          }}
        />
      ) : null}

      <QuickCheckoutModal target={checkoutTarget} onClose={handleCloseCheckOutModal} />

      {selectedRoom ? (
        <PaymentModal
          visible={isPaymentVisible}
          room={selectedRoom}
          onCancel={handleClosePaymentModal}
        />
      ) : null}

      <BlockedRoomDrawer
        room={detailsRoom}
        open={Boolean(detailsRoom)}
        onClose={() => setDetailsRoom(null)}
      />
    </div>
  )
}
