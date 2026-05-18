import { Card, Col, Row, Statistic } from 'antd'
import {
  DollarOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import type { MonthlyRevenueSummary } from '../types'

// Chia 1000 để hiển thị dạng gọn (32.500 = 32.500.000 VND)
function fmt(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount / 1000))
}

interface Props {
  summary: MonthlyRevenueSummary
}

export function RevenueKPICards({ summary }: Props) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Tổng doanh thu net"
            value={fmt(summary.total_net)}
            suffix="nghìn đ"
            prefix={<DollarOutlined />}
            valueStyle={{ color: '#1677ff' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Đã thu"
            value={fmt(summary.total_paid)}
            suffix="nghìn đ"
            prefix={<CheckCircleOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Còn nợ"
            value={fmt(summary.total_debt)}
            suffix="nghìn đ"
            prefix={<WarningOutlined />}
            valueStyle={{ color: summary.total_debt > 0 ? '#ff4d4f' : '#52c41a' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Số nhóm khách"
            value={summary.booking_count}
            suffix="nhóm"
            prefix={<TeamOutlined />}
          />
        </Card>
      </Col>
    </Row>
  )
}
