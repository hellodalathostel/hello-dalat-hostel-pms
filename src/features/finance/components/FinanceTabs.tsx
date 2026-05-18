import { Col, Row, Tabs } from 'antd'
import type { TabsProps } from 'antd'
import dayjs from 'dayjs'
import { RevenueKPICards } from './RevenueKPICards'
import { WeeklyBarChart } from './WeeklyBarChart'
import { SourceBreakdown } from './SourceBreakdown'
import { UnpaidTable } from './UnpaidTable'
import type { MonthlyRevenueSummary, UnpaidGroup } from '../types'

interface Props {
  summary: MonthlyRevenueSummary
  unpaid: UnpaidGroup[]
  unpaidLoading: boolean
  month: dayjs.Dayjs
}

export function FinanceTabs({ summary, unpaid, unpaidLoading, month }: Props) {
  const items: TabsProps['items'] = [
    {
      key: 'overview',
      label: 'Tổng quan',
      children: (
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <RevenueKPICards summary={summary} />
          </Col>
          <Col span={24}>
            <WeeklyBarChart groups={summary.groups} month={month} />
          </Col>
        </Row>
      ),
    },
    {
      key: 'by-source',
      label: 'Theo nguồn',
      children: <SourceBreakdown groups={summary.groups} />,
    },
    {
      key: 'unpaid',
      label: (
        <span>
          Chưa thanh toán
          {unpaid.length > 0 && (
            <span
              style={{
                marginLeft: 6,
                background: '#ff4d4f',
                color: '#fff',
                borderRadius: 10,
                padding: '0 6px',
                fontSize: 12,
              }}
            >
              {unpaid.length}
            </span>
          )}
        </span>
      ),
      children: <UnpaidTable data={unpaid} loading={unpaidLoading} />,
    },
  ]

  return <Tabs items={items} defaultActiveKey="overview" />
}
