import { Col, Row, Tabs } from 'antd'
import type { TabsProps } from 'antd'
import type { UseQueryResult } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { RevenueKPICards } from './RevenueKPICards'
import { WeeklyBarChart } from './WeeklyBarChart'
import { SourceBreakdown } from './SourceBreakdown'
import { UnpaidTable } from './UnpaidTable'
import type { MonthlyRevenueSummary, UnpaidGroup } from '../types'
import { getQueryViewState } from '@/lib/queryViewState'

interface Props {
  summary: MonthlyRevenueSummary
  unpaidQuery: UseQueryResult<UnpaidGroup[], Error>
  month: dayjs.Dayjs
}

export function FinanceTabs({ summary, unpaidQuery, month }: Props) {
  // F04: lỗi tải công nợ KHÔNG được hiện như "không có công nợ"
  const unpaidState = getQueryViewState({
    isLoading: unpaidQuery.isLoading,
    isError: unpaidQuery.isError,
    data: unpaidQuery.data,
  })
  const unpaid = unpaidQuery.data ?? []
  // Chỉ đếm badge khi số liệu chắc chắn (tải thành công); lỗi → ẩn badge
  const unpaidBadgeCount = unpaidState === 'ready' ? unpaid.length : 0

  const items: TabsProps['items'] = [
    {
      key: 'overview',
      label: 'Tổng quan',
      children: (
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <RevenueKPICards summary={summary} month={month} />
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
          {unpaidBadgeCount > 0 && (
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
              {unpaidBadgeCount}
            </span>
          )}
        </span>
      ),
      children: (
        <UnpaidTable
          data={unpaid}
          state={unpaidState}
          error={unpaidQuery.error}
          onRetry={() => void unpaidQuery.refetch()}
          isRetrying={unpaidQuery.isFetching}
        />
      ),
    },
  ]

  return <Tabs items={items} defaultActiveKey="overview" />
}
