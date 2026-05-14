// src/components/BookingActionButtons.tsx
// Nút hành động có điều kiện theo booking status — dùng trong Room Card và Calendar Drawer

import React from 'react'
import { Button, Popconfirm, Space } from 'antd'
import { InfoCircleOutlined, LoginOutlined, LogoutOutlined } from '@ant-design/icons'
import { useCheckinMutation, useCheckoutMutation } from '@/hooks/useBookingActions'

interface Props {
  bookingId: string
  status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled' | string
  onDetails?: () => void // Mở Details drawer/modal (optional)
  size?: 'small' | 'middle' // Để Room Card dùng small, Calendar Drawer dùng middle
  showDetails?: boolean // Hiển thị Details button (default: true)
}

export const BookingActionButtons: React.FC<Props> = ({
  bookingId,
  status,
  onDetails,
  size = 'small',
  showDetails = true,
}) => {
  const checkin = useCheckinMutation()
  const checkout = useCheckoutMutation()

  return (
    <Space size={4} wrap>
      {/* Nút Details — có thể ẩn */}
      {showDetails && onDetails && (
        <Button size={size} icon={<InfoCircleOutlined />} onClick={onDetails}>
          Details
        </Button>
      )}

      {/* Check-in — chỉ khi booked */}
      {status === 'booked' && (
        <Popconfirm
          title="Xác nhận Check-in?"
          description="Phòng sẽ chuyển sang trạng thái Đang ở."
          onConfirm={() => checkin.mutate(bookingId)}
          okText="Check-in"
          cancelText="Huỷ"
          okButtonProps={{ loading: checkin.isPending }}
        >
          <Button
            type="primary"
            size={size}
            icon={<LoginOutlined />}
            loading={checkin.isPending}
          >
            Check-in
          </Button>
        </Popconfirm>
      )}

      {/* Check-out — chỉ khi checked-in */}
      {status === 'checked-in' && (
        <Popconfirm
          title="Xác nhận Check-out?"
          description="Phòng sẽ trả về trạng thái Trống."
          onConfirm={() => checkout.mutate(bookingId)}
          okText="Check-out"
          cancelText="Huỷ"
          okButtonProps={{ loading: checkout.isPending }}
        >
          <Button danger size={size} icon={<LogoutOutlined />} loading={checkout.isPending}>
            Check-out
          </Button>
        </Popconfirm>
      )}
    </Space>
  )
}
