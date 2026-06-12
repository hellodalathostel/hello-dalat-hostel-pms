// FILE: src/features/finance/components/UnpaidTable.tsx
import { Card, Flex, Grid, Skeleton, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { UnpaidGroup } from '../types'

const { Text } = Typography
const { useBreakpoint } = Grid

function fmt(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount / 1000))
}

interface Props {
  data: UnpaidGroup[]
  loading?: boolean
}

// ── Desktop: Table ──────────────────────────────────────────────
const columns: ColumnsType<UnpaidGroup> = [
  { title: 'Khách', dataIndex: 'customer_name', key: 'customer_name' },
  {
    title: 'Kênh',
    dataIndex: 'source',
    key: 'source',
    render: (v: string | null) =>
      v ? <Tag color="blue">{v}</Tag> : <Tag>Khác</Tag>,
  },
  {
    title: 'Check-out',
    dataIndex: 'check_out',
    key: 'check_out',
    render: (v: string) => (v ? dayjs(v).format('DD/MM/YYYY') : '—'),
    sorter: (a, b) => a.check_out.localeCompare(b.check_out),
  },
  {
    title: 'Doanh thu (k)',
    dataIndex: 'net_revenue',
    key: 'net_revenue',
    align: 'right',
    render: (v: number) => fmt(v),
    sorter: (a, b) => a.net_revenue - b.net_revenue,
  },
  {
    title: 'Đã thu (k)',
    dataIndex: 'paid',
    key: 'paid',
    align: 'right',
    render: (v: number) => <span style={{ color: '#52c41a' }}>{fmt(v)}</span>,
  },
  {
    title: 'Còn nợ (k)',
    dataIndex: 'debt',
    key: 'debt',
    align: 'right',
    render: (v: number) => (
      <strong style={{ color: '#ff4d4f' }}>{fmt(v)}</strong>
    ),
    sorter: (a, b) => a.debt - b.debt,
    defaultSortOrder: 'descend',
  },
]

// ── Mobile: Card list ───────────────────────────────────────────
function UnpaidCardList({ data }: { data: UnpaidGroup[] }) {
  if (data.length === 0) {
    return (
      <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 24 }}>
        🎉 Không có khoản nợ nào
      </Text>
    )
  }

  return (
    <Flex vertical gap={8}>
      {data.map((row) => (
        <Card
          key={row.id}
          size="small"
          styles={{ body: { padding: '10px 12px' } }}
        >
          {/* Hàng 1: Tên + Tag kênh */}
          <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
            <Text strong style={{ fontSize: 14 }}>
              {row.customer_name}
            </Text>
            {row.source ? (
              <Tag color="blue" style={{ margin: 0 }}>
                {row.source}
              </Tag>
            ) : (
              <Tag style={{ margin: 0 }}>Khác</Tag>
            )}
          </Flex>

          {/* Hàng 2: Check-out */}
          <Text type="secondary" style={{ fontSize: 12 }}>
            Check-out: {row.check_out ? dayjs(row.check_out).format('DD/MM/YYYY') : '—'}
          </Text>

          {/* Hàng 3: Số tiền */}
          <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
            <Flex gap={12}>
              <Flex vertical>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Doanh thu
                </Text>
                <Text style={{ fontSize: 13 }}>{fmt(row.net_revenue)}k</Text>
              </Flex>
              <Flex vertical>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Đã thu
                </Text>
                <Text style={{ color: '#52c41a', fontSize: 13 }}>{fmt(row.paid)}k</Text>
              </Flex>
            </Flex>
            <Flex vertical align="flex-end">
              <Text type="secondary" style={{ fontSize: 11 }}>
                Còn nợ
              </Text>
              <Text strong style={{ color: '#ff4d4f', fontSize: 16 }}>
                {fmt(row.debt)}k
              </Text>
            </Flex>
          </Flex>
        </Card>
      ))}
    </Flex>
  )
}

// ── Exported component ──────────────────────────────────────────
export function UnpaidTable({ data, loading }: Props) {
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const totalDebt = data.reduce((sum, r) => sum + r.debt, 0)

  const cardTitle = `Chưa thanh toán (${data.length} nhóm)`
  const cardExtra =
    totalDebt > 0 ? (
      <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
        Nợ: {fmt(totalDebt)}k đ
      </span>
    ) : null

  if (loading) {
    return (
      <Card title={cardTitle}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    )
  }

  return (
    <Card title={cardTitle} extra={cardExtra}>
      {isMobile ? (
        <UnpaidCardList data={data} />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          size="middle"
          locale={{ emptyText: '🎉 Không có khoản nợ nào' }}
        />
      )}
    </Card>
  )
}
