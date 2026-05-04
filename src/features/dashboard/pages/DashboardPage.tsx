import type { JSX } from 'react'
import { Card, Col, Row, Skeleton, Statistic, Typography } from 'antd'
import { useDashboardSummary } from '@/features/dashboard/hooks/useDashboardSummary'

export function DashboardPage(): JSX.Element {
  const { data, isLoading } = useDashboardSummary()

  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 6 }} />
  }

  return (
    <div className="page-grid">
      <Typography.Title level={2}>Bảng điều khiển vận hành</Typography.Title>
      <Typography.Paragraph className="page-subtitle">
        Dữ liệu được đọc trực tiếp từ database, frontend không tự tính doanh thu tổng.
      </Typography.Paragraph>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="Tỷ lệ lấp đầy" value={data?.occupancy_rate ?? 0} suffix="%" precision={1} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="Check-in hôm nay" value={data?.checkin_today ?? 0} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="Check-out hôm nay" value={data?.checkout_today ?? 0} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic
              title="Booking nhóm chờ xử lý"
              value={data?.pending_group_bookings ?? 0}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
