// FILE: src/features/finance/components/WeeklyBarChart.tsx
import { useMemo } from 'react'
import { Card, Empty, Grid } from 'antd'
import dayjs from 'dayjs'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { GroupRevenueSummary } from '../types'

const { useBreakpoint } = Grid

interface Props {
  groups: GroupRevenueSummary[]
  month: dayjs.Dayjs
}

interface WeekBucket {
  label: string
  revenue: number
}

function buildWeeklyData(groups: GroupRevenueSummary[], month: dayjs.Dayjs): WeekBucket[] {
  const buckets: WeekBucket[] = [
    { label: 'T1', revenue: 0 },
    { label: 'T2', revenue: 0 },
    { label: 'T3', revenue: 0 },
    { label: 'T4', revenue: 0 },
    { label: 'T5', revenue: 0 },
  ]

  for (const g of groups) {
    if (!g.check_out) continue
    const d = dayjs(g.check_out)
    if (d.month() !== month.month() || d.year() !== month.year()) continue
    const weekIdx = Math.min(Math.ceil(d.date() / 7) - 1, 4)
    buckets[weekIdx].revenue += g.net_revenue
  }

  return buckets.filter((b) => b.revenue > 0)
}

function fmtK(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(value / 1000))}k`
}

export function WeeklyBarChart({ groups, month }: Props) {
  const screens = useBreakpoint()
  const isMobile = !screens.md

  const data = useMemo(() => buildWeeklyData(groups, month), [groups, month])

  if (data.length === 0) {
    return (
      <Card title="Doanh thu theo tuần">
        <Empty description="Không có dữ liệu" />
      </Card>
    )
  }

  return (
    <Card title="Doanh thu theo tuần (nghìn đồng)">
      <ResponsiveContainer width="100%" height={isMobile ? 180 : 240}>
        <BarChart
          data={data}
          margin={{
            top: 8,
            right: isMobile ? 8 : 16,
            left: isMobile ? -16 : 0, // thu YAxis vào để tiết kiệm chiều ngang
            bottom: 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: isMobile ? 11 : 13 }}
          />
          <YAxis
            tickFormatter={fmtK}
            width={isMobile ? 52 : 70}
            tick={{ fontSize: isMobile ? 10 : 12 }}
          />
          <Tooltip
            formatter={(v) => [fmtK(Number(v ?? 0)), 'Doanh thu']}
            contentStyle={{ fontSize: 13 }}
          />
          <Bar dataKey="revenue" fill="#1677ff" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}
