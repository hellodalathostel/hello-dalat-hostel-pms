import { useMemo } from 'react'
import { Card, Empty } from 'antd'
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

interface Props {
  groups: GroupRevenueSummary[]
  month: dayjs.Dayjs
}

interface WeekBucket {
  label: string
  revenue: number
}

// Nhóm doanh thu theo tuần trong tháng (tuần 1–5)
function buildWeeklyData(groups: GroupRevenueSummary[], month: dayjs.Dayjs): WeekBucket[] {
  const buckets: WeekBucket[] = [
    { label: 'Tuần 1', revenue: 0 },
    { label: 'Tuần 2', revenue: 0 },
    { label: 'Tuần 3', revenue: 0 },
    { label: 'Tuần 4', revenue: 0 },
    { label: 'Tuần 5', revenue: 0 },
  ]

  for (const g of groups) {
    if (!g.check_out) continue
    const d = dayjs(g.check_out)
    if (d.month() !== month.month() || d.year() !== month.year()) continue
    const weekIdx = Math.min(Math.floor((d.date() - 1) / 7), 4)
    buckets[weekIdx].revenue += g.net_revenue
  }

  return buckets.filter((b) => b.revenue > 0)
}

// Hiển thị dạng nghìn đồng
function fmtK(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(value / 1000))}k`
}

export function WeeklyBarChart({ groups, month }: Props) {
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
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis tickFormatter={fmtK} width={70} />
          <Tooltip formatter={(v) => [fmtK(Number(v ?? 0)), 'Doanh thu']} />
          <Bar dataKey="revenue" fill="#1677ff" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}
