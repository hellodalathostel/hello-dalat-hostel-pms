// FILE: src/features/finance/components/UnpaidTable.tsx
import { Card, Flex, Grid, Skeleton, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { UnpaidGroup } from '../types'
import type { QueryViewState } from '@/lib/queryViewState'
import { QueryErrorState } from '@/components/QueryErrorState'

const { Text } = Typography
const { useBreakpoint } = Grid

function fmt(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount / 1000))
}

interface Props {
  data: UnpaidGroup[]
  state: QueryViewState
  error?: unknown
  onRetry: () => void
  isRetrying?: boolean
}

const LOAD_ERROR_TITLE = 'Không tải được danh sách công nợ'

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
    title: 'Tổng tiền (k)',
    dataIndex: 'grand_total',
    key: 'grand_total',
    align: 'right',
    render: (v: number) => fmt(v),
    sorter: (a, b) => a.grand_total - b.grand_total,
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
                  Tổng tiền
                </Text>
                <Text style={{ fontSize: 13 }}>{fmt(row.grand_total)}k</Text>
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
export function UnpaidTable({ data, state, error, onRetry, isRetrying }: Props) {
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

  if (state === 'loading') {
    return (
      <Card title={cardTitle}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    )
  }

  // F04: lỗi và chưa có dữ liệu → KHÔNG hiện "Không có khoản nợ nào", không hiện số nhóm/tổng nợ
  if (state === 'error') {
    return (
      <Card title="Chưa thanh toán">
        <QueryErrorState title={LOAD_ERROR_TITLE} error={error} onRetry={onRetry} isRetrying={isRetrying} />
      </Card>
    )
  }

  return (
    <Card title={cardTitle} extra={cardExtra}>
      {state === 'stale-error' && (
        <QueryErrorState variant="banner" title={LOAD_ERROR_TITLE} onRetry={onRetry} isRetrying={isRetrying} />
      )}
      <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 12 }}>
        Toàn kỳ — mọi nhóm có booking đã check-out còn nợ, không theo tháng đang chọn.
      </Text>
      {isMobile ? (
        <UnpaidCardList data={data} />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          size="middle"
          locale={{ emptyText: '🎉 Không có khoản nợ nào' }}
        />
      )}
    </Card>
  )
}
