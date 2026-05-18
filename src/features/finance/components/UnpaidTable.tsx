import { Card, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { UnpaidGroup } from '../types'

function fmt(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount / 1000))
}

interface Props {
  data: UnpaidGroup[]
  loading?: boolean
}

const columns: ColumnsType<UnpaidGroup> = [
  {
    title: 'Khách',
    dataIndex: 'customer_name',
    key: 'customer_name',
  },
  {
    title: 'Kênh',
    dataIndex: 'source',
    key: 'source',
    render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : <Tag>Khác</Tag>),
  },
  {
    title: 'Check-out',
    dataIndex: 'check_out',
    key: 'check_out',
    render: (v: string) => (v ? dayjs(v).format('DD/MM/YYYY') : '—'),
    sorter: (a, b) => a.check_out.localeCompare(b.check_out),
  },
  {
    title: 'Doanh thu (nghìn đ)',
    dataIndex: 'net_revenue',
    key: 'net_revenue',
    align: 'right',
    render: (v: number) => fmt(v),
    sorter: (a, b) => a.net_revenue - b.net_revenue,
  },
  {
    title: 'Đã thu (nghìn đ)',
    dataIndex: 'paid',
    key: 'paid',
    align: 'right',
    render: (v: number) => <span style={{ color: '#52c41a' }}>{fmt(v)}</span>,
  },
  {
    title: 'Còn nợ (nghìn đ)',
    dataIndex: 'debt',
    key: 'debt',
    align: 'right',
    render: (v: number) => <strong style={{ color: '#ff4d4f' }}>{fmt(v)}</strong>,
    sorter: (a, b) => a.debt - b.debt,
    defaultSortOrder: 'descend',
  },
]

export function UnpaidTable({ data, loading }: Props) {
  const totalDebt = data.reduce((sum, r) => sum + r.debt, 0)

  return (
    <Card
      title={`Chưa thanh toán (${data.length} nhóm)`}
      extra={
        totalDebt > 0 ? (
          <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
            Tổng nợ: {fmt(totalDebt)} nghìn đ
          </span>
        ) : null
      }
    >
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        size="middle"
        locale={{ emptyText: '🎉 Không có khoản nợ nào' }}
      />
    </Card>
  )
}
