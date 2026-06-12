// FILE: src/features/finance/pages/FinancePage.tsx
import { useState } from 'react'
import dayjs from 'dayjs'
import { Alert, Button, DatePicker, Flex, Grid, Spin, Typography } from 'antd'
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { useMonthlyRevenue } from '../hooks/useMonthlyRevenue'
import { useUnpaidBookings } from '../hooks/useUnpaidBookings'
import { FinanceTabs } from '../components/FinanceTabs'
import { ManualRevenueModal } from '../components/ManualRevenueModal'
import { exportFinanceExcel } from '../utils/exportFinanceExcel'

const { Title } = Typography
const { useBreakpoint } = Grid

export default function FinancePage() {
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'))
  const [manualRevenueOpen, setManualRevenueOpen] = useState(false)
  const screens = useBreakpoint()
  const isMobile = !screens.md

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useMonthlyRevenue(month)

  const { data: unpaid = [], isLoading: unpaidLoading } = useUnpaidBookings()

  function handleMonthChange(value: Dayjs | null) {
    if (value) setMonth(value.startOf('month'))
  }

  function handleExport() {
    if (!summary) return
    exportFinanceExcel(summary, month)
  }

  return (
    <div style={{ padding: isMobile ? '12px 16px' : '16px 24px' }}>
      {/* Header — wrap tốt trên mobile */}
      <Flex wrap="wrap" gap={8} align="center" style={{ marginBottom: 16 }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0, flex: '1 1 auto' }}>
          📊 Tài chính
        </Title>
        <DatePicker
          picker="month"
          value={month}
          onChange={handleMonthChange}
          format="MM/YYYY"
          allowClear={false}
          style={{ width: isMobile ? '100%' : 130 }}
        />
        <Flex gap={8} style={{ width: isMobile ? '100%' : 'auto' }}>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={!summary || summaryLoading}
            style={{ flex: 1 }}
          >
            {isMobile ? 'Excel' : 'Xuất Excel'}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setManualRevenueOpen(true)}
            style={{ flex: 1 }}
          >
            {isMobile ? 'Nhập' : 'Nhập thủ công'}
          </Button>
        </Flex>
      </Flex>

      {summaryError && (
        <Alert
          type="error"
          message="Không tải được dữ liệu doanh thu"
          description={
            summaryError instanceof Error ? summaryError.message : String(summaryError)
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {summaryLoading ? (
        <div style={{ textAlign: 'center', padding: 64 }}>
          <Spin size="large" tip="Đang tải dữ liệu..." />
        </div>
      ) : summary ? (
        <FinanceTabs
          summary={summary}
          unpaid={unpaid}
          unpaidLoading={unpaidLoading}
          month={month}
        />
      ) : null}

      <ManualRevenueModal
        open={manualRevenueOpen}
        onClose={() => setManualRevenueOpen(false)}
      />
    </div>
  )
}
