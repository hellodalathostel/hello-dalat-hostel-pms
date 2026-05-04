import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Alert, Card, Col, Row, Select, Spin, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { useRevenue, aggregateByMonth, type MonthSummary } from '@/hooks/useRevenue'

function formatVND(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} d`
}

function formatShortVND(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}Md`
  }

  if (amount >= 100_000) {
    return `${(amount / 100_000).toFixed(0)}100kd`
  }

  return `${amount}d`
}

const COLORS = ['#1072e8', '#52c41a', '#faad14', '#f5562d', '#722ed1', '#13c8de']

export default function RevenueDashboard(): React.JSX.Element {
  const [year, setYear] = useState(dayjs().year())

  const { data: raw, isLoading, error } = useRevenue(year)
  const summaries: MonthSummary[] = useMemo(() => aggregateByMonth(raw ?? []), [raw])

  const yearOptions = useMemo(() => {
    const currentYear = dayjs().year()
    return [currentYear, currentYear - 1, currentYear - 2].map((item) => ({
      label: `${item}`,
      value: item,
    }))
  }, [])

  const totals = useMemo(() => {
    return summaries.reduce(
      (accumulator, item) => {
        accumulator.totalGross += item.total_gross
        accumulator.confirmedRevenue += item.confirmed_revenue
        accumulator.projectedRevenue += item.projected_revenue
        accumulator.netRevenue += item.net_revenue
        accumulator.bookingCount += item.booking_count
        accumulator.totalNights += item.total_nights
        return accumulator
      },
      {
        totalGross: 0,
        confirmedRevenue: 0,
        projectedRevenue: 0,
        netRevenue: 0,
        bookingCount: 0,
        totalNights: 0,
      },
    )
  }, [summaries])

  const monthlyChartData = useMemo(() => {
    return summaries.map((item) => ({
      ...item,
      monthLabel: `Th ${dayjs(item.month).format('M/YYYY')}`,
    }))
  }, [summaries])

  const pieData = useMemo(() => {
    const aggregate = new Map<string, number>()

    summaries.forEach((item) => {
      Object.entries(item.bySource).forEach(([source, value]) => {
        aggregate.set(source, (aggregate.get(source) ?? 0) + value)
      })
    })

    return Array.from(aggregate.entries()).map(([name, value]) => ({ name, value }))
  }, [summaries])

  const roomData = useMemo(() => {
    const aggregate = new Map<string, number>()

    summaries.forEach((item) => {
      Object.entries(item.byRoom).forEach(([roomId, value]) => {
        aggregate.set(roomId, (aggregate.get(roomId) ?? 0) + value)
      })
    })

    return Array.from(aggregate.entries())
      .map(([roomId, value]) => ({ phong: `Ph ${roomId}`, value }))
      .sort((a, b) => b.value - a.value)
  }, [summaries])

  const tableData = useMemo(() => {
    return [...summaries].sort((a, b) => b.month.localeCompare(a.month))
  }, [summaries])

  const columns: ColumnsType<MonthSummary> = [
    {
      title: 'Tháng',
      dataIndex: 'month',
      key: 'month',
      render: (value: string) => `Th ${dayjs(value).format('M/YYYY')}`,
    },
    {
      title: 'Số booking',
      dataIndex: 'booking_count',
      key: 'booking_count',
    },
    {
      title: 'Số đêm lưu trú',
      dataIndex: 'total_nights',
      key: 'total_nights',
    },
    {
      title: 'Doanh thu gộp',
      dataIndex: 'total_gross',
      key: 'total_gross',
      render: (value: number) => formatVND(value),
    },
    {
      title: 'Đã xác nhận',
      dataIndex: 'confirmed_revenue',
      key: 'confirmed_revenue',
      render: (value: number) =>
        value > 0 ? <Typography.Text style={{ color: '#52c41a' }}>{formatVND(value)}</Typography.Text> : formatVND(value),
    },
    {
      title: 'Dự kiến',
      dataIndex: 'projected_revenue',
      key: 'projected_revenue',
      render: (value: number) =>
        value > 0 ? <Typography.Text style={{ color: '#fa8c16' }}>{formatVND(value)}</Typography.Text> : formatVND(value),
    },
  ]

  return (
    <div className="page-grid">
      <Row gutter={[16, 16]} align="middle" justify="space-between">
        <Col>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Doanh thu
          </Typography.Title>
        </Col>
        <Col>
          <Select
            value={year}
            options={yearOptions}
            onChange={(value) => setYear(value)}
            style={{ minWidth: 140 }}
          />
        </Col>
      </Row>

      {error ? <Alert type="error" message={error.message} showIcon /> : null}

      <Spin spinning={isLoading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8} xl={6}>
            <Card>
              <Statistic
                title="Tổng doanh thu"
                value={totals.totalGross}
                formatter={() => formatVND(totals.totalGross)}
              />
              <Typography.Paragraph style={{ marginBottom: 0, marginTop: 8 }}>
                {formatVND(totals.confirmedRevenue)} + {formatVND(totals.projectedRevenue)}
              </Typography.Paragraph>
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8} xl={6}>
            <Card>
              <Typography.Text>Đã xác nhận</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Tag color="success">Đã xác nhận</Tag>
                <Typography.Title level={4} style={{ margin: '8px 0 0' }}>
                  {formatVND(totals.confirmedRevenue)}
                </Typography.Title>
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8} xl={6}>
            <Card>
              <Typography.Text>Dự kiến</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Tag color="orange">Dự kiến</Tag>
                <Typography.Title level={4} style={{ margin: '8px 0 0' }}>
                  {formatVND(totals.projectedRevenue)}
                </Typography.Title>
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8} xl={3}>
            <Card>
              <Statistic title="Số đêm" value={totals.bookingCount} />
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8} xl={3}>
            <Card>
              <Statistic title="Số đêm lưu trú" value={totals.totalNights} />
            </Card>
          </Col>
        </Row>

        <Card title="Doanh thu theo tháng">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={monthlyChartData}>
              <XAxis dataKey="monthLabel" />
              <YAxis tickFormatter={(value: number) => formatShortVND(value)} />
              <Tooltip formatter={(value: unknown) => formatVND(value as number)} />
              <Legend />
              <Bar name="Đã xác nhận" dataKey="confirmed_revenue" fill="#52c41a" stackId="revenue" />
              <Bar name="Dự kiến" dataKey="projected_revenue" fill="#fa8c16" stackId="revenue" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            <Card title="Nguồn khách">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} label>
                    {pieData.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => `${String(name)}: ${formatVND(value as number)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Col>

          <Col xs={24} xl={12}>
            <Card title="Doanh thu theo phòng">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={roomData} layout="vertical" margin={{ left: 12, right: 12 }}>
                  <XAxis type="number" tickFormatter={(value: number) => formatShortVND(value)} />
                  <YAxis type="category" dataKey="phong" width={72} />
                  <Tooltip formatter={(value: unknown) => formatVND(value as number)} />
                  <Bar dataKey="value" fill="#1072e8" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>

        <Card title="Chi tiết theo tháng">
          <Table
            rowKey="month"
            dataSource={tableData}
            columns={columns}
            pagination={false}
          />
        </Card>
      </Spin>
    </div>
  )
}
