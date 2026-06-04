import { Card, Col, Row, Statistic } from 'antd'
import type { DashboardStats } from '@/types/dashboard'

interface StatsBarProps {
  stats: DashboardStats
}

const statStyles = {
  vacant: { color: '#2f9e44', title: 'Trống' },
  arriving: { color: '#1971c2', title: 'Sắp đến' },
  occupied: { color: '#7048e8', title: 'Đang ở' },
  checkoutToday: { color: '#e03131', title: 'Trả phòng hôm nay' },
  debt: { color: '#f08c00', title: 'Còn nợ' },
} as const

// Thanh thống kê tổng quan theo các nhóm trạng thái chính.
export function StatsBar({ stats }: StatsBarProps): React.JSX.Element {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={4}>
        <Card>
          <Statistic title={statStyles.vacant.title} value={stats.vacant} valueStyle={{ color: statStyles.vacant.color }} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={5}>
        <Card>
          <Statistic title={statStyles.arriving.title} value={stats.arriving} valueStyle={{ color: statStyles.arriving.color }} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={5}>
        <Card>
          <Statistic title={statStyles.occupied.title} value={stats.occupied} valueStyle={{ color: statStyles.occupied.color }} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={5}>
        <Card>
          <Statistic
            title={statStyles.checkoutToday.title}
            value={stats.checkoutToday}
            valueStyle={{ color: statStyles.checkoutToday.color }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={5}>
        <Card>
          <Statistic title={statStyles.debt.title} value={stats.debt} valueStyle={{ color: statStyles.debt.color }} />
        </Card>
      </Col>
    </Row>
  )
}
