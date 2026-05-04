import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Typography } from 'antd'

export function BookingsPage(): JSX.Element {
  const navigate = useNavigate()

  return (
    <div className="page-grid">
      <Typography.Title level={2}>Quản lý đặt phòng</Typography.Title>
      <Typography.Paragraph className="page-subtitle">
        Tạo và quản lý đặt phòng theo nhóm (group booking) thông qua giao dịch database.
      </Typography.Paragraph>
      <Button type="primary" size="large" onClick={() => navigate('/new-booking')}>
        Tạo đặt phòng mới
      </Button>
    </div>
  )
}
