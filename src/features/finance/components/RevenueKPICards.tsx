import { Card, Col, Row, Statistic, Tooltip } from 'antd'
import {
  DollarOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import type { MonthlyRevenueSummary } from '../types'

// Hiển thị số VND đầy đủ (2.432.000 đ)
function fmt(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' đ'
}

interface Props {
  summary: MonthlyRevenueSummary
}

export function RevenueKPICards({ summary }: Props) {
  // Clamp — không hiển thị số âm khi khách đã thanh toán trước cho nhiều tháng
  const totalDebt = Math.max(0, summary.total_debt)

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Tổng doanh thu net"
            value={fmt(summary.total_net)}
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
            prefix={<CheckCircleOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Tooltip title="Chênh lệch do khách đã thanh toán trước cho nhiều tháng">
          <Card>
            <Statistic
              title="Còn nợ"
              value={fmt(totalDebt)}
              prefix={<WarningOutlined />}
              valueStyle={{ color: totalDebt > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Tooltip>
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
