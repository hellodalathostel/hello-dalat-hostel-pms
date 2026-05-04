import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Col, Flex, Row, Spin, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { CheckInModal } from '@/components/checkin/CheckInModal'
import { CheckOutModal } from '@/components/checkout/CheckOutModal'
import { RoomCard } from '@/components/dashboard/RoomCard'
import { PaymentModal } from '@/components/payment/PaymentModal'
import { StatsBar } from '@/components/dashboard/StatsBar'
import { getRoomStatus, useDashboard } from '@/hooks/useDashboard'
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
  const [isCheckInVisible, setIsCheckInVisible] = useState(false)
  const [isCheckOutVisible, setIsCheckOutVisible] = useState(false)
  const [isPaymentVisible, setIsPaymentVisible] = useState(false)

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

  const handleCloseCheckInModal = useCallback(() => {
    setIsCheckInVisible(false)
    if (!isCheckOutVisible && !isPaymentVisible) {
      setSelectedRoom(null)
    }
  }, [isCheckOutVisible, isPaymentVisible])

  const handleCloseCheckOutModal = useCallback(() => {
    setIsCheckOutVisible(false)
    if (!isCheckInVisible && !isPaymentVisible) {
      setSelectedRoom(null)
    }
  }, [isCheckInVisible, isPaymentVisible])

  const handleClosePaymentModal = useCallback(() => {
    setIsPaymentVisible(false)
    if (!isCheckInVisible && !isCheckOutVisible) {
      setSelectedRoom(null)
    }
  }, [isCheckInVisible, isCheckOutVisible])

  const handlePaymentClick = useCallback((room: DashboardRoom) => {
    setSelectedRoom(room)
    setIsPaymentVisible(true)
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
      if (!room.booking_id) {
        notification.error({
          message: 'Thiếu dữ liệu booking',
          description: 'Không thể mở check-out vì thiếu booking_id.',
        })
        return
      }

      setSelectedRoom(room)
      setIsCheckOutVisible(true)
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
              />
            </Col>
          ))}
        </Row>
      </Spin>

      {selectedRoom ? (
        <CheckInModal
          isOpen={isCheckInVisible}
          bookingId={selectedRoom.booking_id ?? ''}
          onClose={handleCloseCheckInModal}
        />
      ) : null}

      {selectedRoom ? (
        <CheckOutModal
          isOpen={isCheckOutVisible}
          bookingId={selectedRoom.booking_id ?? ''}
          onClose={handleCloseCheckOutModal}
        />
      ) : null}

      {selectedRoom ? (
        <PaymentModal
          visible={isPaymentVisible}
          room={selectedRoom}
          onCancel={handleClosePaymentModal}
        />
      ) : null}
    </div>
  )
}
