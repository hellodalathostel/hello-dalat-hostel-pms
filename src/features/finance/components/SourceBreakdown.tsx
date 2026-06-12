// FILE: src/features/finance/components/SourceBreakdown.tsx
import { useMemo } from 'react'
import { Card, Flex, Grid, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { GroupRevenueSummary } from '../types'

const { Text } = Typography
const { useBreakpoint } = Grid

function fmt(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount / 1000))
}

function calcOtaFee(netRevenue: number, rate: number): number {
  if (!rate) return 0
  return Math.round(netRevenue * rate)
}

interface SourceRow {
  source: string
  count: number
  revenue: number
  otaFee: number
  netAfterFee: number
}

interface Props {
  groups: GroupRevenueSummary[]
}

// ── Desktop columns (5 cột) ─────────────────────────────────────
const columnsDesktop: ColumnsType<SourceRow> = [
  {
    title: 'Kênh đặt phòng',
    dataIndex: 'source',
    key: 'source',
    render: (v: string) => <Tag color="blue">{v}</Tag>,
  },
  { title: 'Số nhóm', dataIndex: 'count', key: 'count', align: 'right' },
  {
    title: 'Doanh thu (k)',
    dataIndex: 'revenue',
    key: 'revenue',
    align: 'right',
    render: (v: number) => fmt(v),
    sorter: (a, b) => a.revenue - b.revenue,
  },
  {
    title: 'OTA fee (k)',
    dataIndex: 'otaFee',
    key: 'otaFee',
    align: 'right',
    render: (v: number) =>
      v > 0 ? <span style={{ color: '#ff4d4f' }}>{fmt(v)}</span> : '—',
  },
  {
    title: 'Net sau fee (k)',
    dataIndex: 'netAfterFee',
    key: 'netAfterFee',
    align: 'right',
    render: (v: number) => <strong>{fmt(v)}</strong>,
    sorter: (a, b) => a.netAfterFee - b.netAfterFee,
  },
]

// ── Mobile columns (3 cột rút gọn) ─────────────────────────────
const columnsMobile: ColumnsType<SourceRow> = [
  {
    title: 'Kênh',
    dataIndex: 'source',
    key: 'source',
    render: (v: string) => (
      <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
        {v}
      </Tag>
    ),
  },
  {
    title: 'Nhóm',
    dataIndex: 'count',
    key: 'count',
    align: 'right',
    width: 48,
  },
  {
    title: 'Net (k)',
    dataIndex: 'netAfterFee',
    key: 'netAfterFee',
    align: 'right',
    render: (v: number) => <strong>{fmt(v)}</strong>,
    sorter: (a, b) => a.netAfterFee - b.netAfterFee,
  },
]

function DesktopSummary({ pageData }: { pageData: readonly SourceRow[] }) {
  const totalRevenue = pageData.reduce((sum, r) => sum + r.revenue, 0)
  const totalFee = pageData.reduce((sum, r) => sum + r.otaFee, 0)
  const totalNet = pageData.reduce((sum, r) => sum + r.netAfterFee, 0)
  const totalCount = pageData.reduce((sum, r) => sum + r.count, 0)

  return (
    <Table.Summary.Row>
      <Table.Summary.Cell index={0}>
        <strong>Tổng cộng</strong>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={1} align="right">
        <strong>{totalCount}</strong>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={2} align="right">
        <strong>{fmt(totalRevenue)}</strong>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={3} align="right">
        <strong style={{ color: totalFee > 0 ? '#ff4d4f' : undefined }}>
          {totalFee > 0 ? fmt(totalFee) : '—'}
        </strong>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={4} align="right">
        <strong>{fmt(totalNet)}</strong>
      </Table.Summary.Cell>
    </Table.Summary.Row>
  )
}

function MobileSummary({ pageData }: { pageData: readonly SourceRow[] }) {
  const totalNet = pageData.reduce((sum, r) => sum + r.netAfterFee, 0)
  const totalCount = pageData.reduce((sum, r) => sum + r.count, 0)

  return (
    <Table.Summary.Row>
      <Table.Summary.Cell index={0}>
        <strong>Tổng</strong>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={1} align="right">
        <strong>{totalCount}</strong>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={2} align="right">
        <strong>{fmt(totalNet)}</strong>
      </Table.Summary.Cell>
    </Table.Summary.Row>
  )
}

export function SourceBreakdown({ groups }: Props) {
  const screens = useBreakpoint()
  const isMobile = !screens.md

  const rows = useMemo<SourceRow[]>(() => {
    const map = new Map<string, SourceRow>()
    for (const g of groups) {
      const src = g.source ?? 'Khác'
      const fee = calcOtaFee(g.net_revenue, g.channel_fee_rate)
      const existing = map.get(src)
      if (existing) {
        existing.count += 1
        existing.revenue += g.net_revenue
        existing.otaFee += fee
        existing.netAfterFee += g.net_revenue - fee
      } else {
        map.set(src, {
          source: src,
          count: 1,
          revenue: g.net_revenue,
          otaFee: fee,
          netAfterFee: g.net_revenue - fee,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [groups])

  // Mobile: thêm footer tóm tắt OTA fee bên dưới table rút gọn
  const totalFee = rows.reduce((sum, r) => sum + r.otaFee, 0)

  return (
    <Card title="Doanh thu theo kênh đặt phòng">
      <Table
        columns={isMobile ? columnsMobile : columnsDesktop}
        dataSource={rows}
        rowKey="source"
        pagination={false}
        size={isMobile ? 'small' : 'middle'}
        summary={(pageData) =>
          isMobile ? (
            <MobileSummary pageData={pageData} />
          ) : (
            <DesktopSummary pageData={pageData} />
          )
        }
      />
      {/* Mobile: hiển thị OTA fee tổng cộng phía dưới nếu có */}
      {isMobile && totalFee > 0 && (
        <Flex justify="flex-end" style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            OTA fee tổng:{' '}
            <Text style={{ color: '#ff4d4f', fontSize: 12 }}>
              {fmt(totalFee)}k đ
            </Text>
          </Text>
        </Flex>
      )}
    </Card>
  )
}
