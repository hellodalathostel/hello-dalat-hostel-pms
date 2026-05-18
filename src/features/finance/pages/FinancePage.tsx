import { useState } from 'react'
import dayjs from 'dayjs'
import { Alert, Button, DatePicker, Space, Spin, Typography } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { useMonthlyRevenue } from '../hooks/useMonthlyRevenue'
import { useUnpaidBookings } from '../hooks/useUnpaidBookings'
import { FinanceTabs } from '../components/FinanceTabs'
import { exportFinanceExcel } from '../utils/exportFinanceExcel'

const { Title } = Typography

export default function FinancePage() {
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'))

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useMonthlyRevenue(month)

  const { data: unpaid = [], isLoading: unpaidLoading } = useUnpaidBookings()

  function handleMonthChange(value: Dayjs | null) {
    if (value) {
      setMonth(value.startOf('month'))
    }
  }

  function handleExport() {
    if (!summary) return
    exportFinanceExcel(summary, month)
  }

  return (
    <div style={{ padding: '16px 24px' }}>
      <Space style={{ marginBottom: 16 }} align="center" wrap>
        <Title level={3} style={{ margin: 0 }}>
          📊 Tài chính
        </Title>
        <DatePicker
          picker="month"
          value={month}
          onChange={handleMonthChange}
          format="MM/YYYY"
          allowClear={false}
        />
        <Button
          icon={<DownloadOutlined />}
          onClick={handleExport}
          disabled={!summary || summaryLoading}
          type="default"
        >
          Xuất Excel
        </Button>
      </Space>

      {summaryError && (
        <Alert
          type="error"
          message="Không tải được dữ liệu doanh thu"
          description={summaryError instanceof Error ? summaryError.message : String(summaryError)}
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
    </div>
  )
}
