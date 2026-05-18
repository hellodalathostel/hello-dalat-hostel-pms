import { useMemo } from 'react'
import { Card, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { GroupRevenueSummary } from '../types'

// Chia 1000 để hiển thị gọn
function fmt(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount / 1000))
}

// Tính OTA fee: ≈ net_revenue * channel_fee_rate
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

const columns: ColumnsType<SourceRow> = [
  {
    title: 'Kênh đặt phòng',
    dataIndex: 'source',
    key: 'source',
    render: (v: string) => <Tag color="blue">{v}</Tag>,
  },
  {
    title: 'Số nhóm',
    dataIndex: 'count',
    key: 'count',
    align: 'right',
  },
  {
    title: 'Doanh thu (nghìn đ)',
    dataIndex: 'revenue',
    key: 'revenue',
    align: 'right',
    render: (v: number) => fmt(v),
    sorter: (a, b) => a.revenue - b.revenue,
  },
  {
    title: 'OTA fee (nghìn đ)',
    dataIndex: 'otaFee',
    key: 'otaFee',
    align: 'right',
    render: (v: number) => (v > 0 ? <span style={{ color: '#ff4d4f' }}>{fmt(v)}</span> : '—'),
  },
  {
    title: 'Net sau fee (nghìn đ)',
    dataIndex: 'netAfterFee',
    key: 'netAfterFee',
    align: 'right',
    render: (v: number) => <strong>{fmt(v)}</strong>,
    sorter: (a, b) => a.netAfterFee - b.netAfterFee,
  },
]

export function SourceBreakdown({ groups }: Props) {
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

  return (
    <Card title="Doanh thu theo kênh đặt phòng">
      <Table
        columns={columns}
        dataSource={rows}
        rowKey="source"
        pagination={false}
        size="middle"
        summary={(pageData) => {
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
        }}
      />
    </Card>
  )
}
