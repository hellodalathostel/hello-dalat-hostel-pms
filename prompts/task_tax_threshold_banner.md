# Task: Thêm Tax Threshold Banner vào S1aPage

## Bối cảnh
Đã tạo RPC `get_tax_threshold_summary(p_year INT DEFAULT NULL)` trên Supabase (migration đã apply).
RPC trả JSON: `{ year, pms_actual, pms_future_booked, manual_total, total_actual, threshold,
percent_of_threshold, remaining_to_threshold, status ('green'|'yellow'|'red'), forecast_total,
forecast_exceeds_threshold, is_current_year, by_month: [{thang, doanh_thu}] }`.

Cần 3 thay đổi, làm đúng thứ tự:

---

## Bước 1 — Tạo file mới: `src/features/compliance/hooks/useTaxThresholdSummary.ts`

Tạo file với nội dung chính xác sau:

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'

export interface TaxThresholdMonthRow {
  thang: number
  doanh_thu: number
}

export interface TaxThresholdSummary {
  year: number
  pms_actual: number
  pms_future_booked: number
  manual_total: number
  total_actual: number
  threshold: number
  percent_of_threshold: number
  remaining_to_threshold: number
  status: 'green' | 'yellow' | 'red'
  forecast_total: number
  forecast_exceeds_threshold: boolean
  is_current_year: boolean
  by_month: TaxThresholdMonthRow[]
}

// Hook lấy tổng quan ngưỡng thuế 1 tỷ (Nghị định 141/2026, Nhóm I).
// Gọi RPC get_tax_threshold_summary — merge v_s1a_hkd (thực tế, ngay_ghi_so <= hôm nay)
// + revenue_manual_log. KHÔNG dùng pms_future_booked để tính ngưỡng/dự báo.
export function useTaxThresholdSummary(year: number) {
  return useQuery<TaxThresholdSummary>({
    queryKey: ['tax-threshold-summary', year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_tax_threshold_summary', {
        p_year: year,
      })

      if (error) throw error
      return data as TaxThresholdSummary
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

---

## Bước 2 — Tạo file mới: `src/features/compliance/components/TaxThresholdBanner.tsx`

Tạo thư mục `components` nếu chưa có trong `src/features/compliance/`. Nội dung file:

```tsx
import { useMemo } from 'react'
import { Alert, Card, Col, Progress, Row, Skeleton, Statistic, Tooltip, Typography } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { useTaxThresholdSummary } from '../hooks/useTaxThresholdSummary'

const { Text } = Typography

function fmtVND(n: number): string {
  return n.toLocaleString('vi-VN') + 'đ'
}

// Map status từ RPC sang màu Ant Design + nhãn tiếng Việt theo skill hello-dalat-tax-ops
const STATUS_CONFIG: Record<
  'green' | 'yellow' | 'red',
  { color: string; label: string; progressStatus: 'success' | 'normal' | 'exception' }
> = {
  green: { color: '#52c41a', label: '🟢 An toàn Nhóm I', progressStatus: 'success' },
  yellow: { color: '#faad14', label: '🟡 Theo dõi sát — gần ngưỡng', progressStatus: 'normal' },
  red: { color: '#ff4d4f', label: '🔴 Đã vượt ngưỡng — cần chuyển Nhóm II', progressStatus: 'exception' },
}

interface TaxThresholdBannerProps {
  year: number
}

export function TaxThresholdBanner({ year }: TaxThresholdBannerProps) {
  const { data, isLoading, error } = useTaxThresholdSummary(year)

  const statusConfig = useMemo(
    () => (data ? STATUS_CONFIG[data.status] : STATUS_CONFIG.green),
    [data],
  )

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Không tải được dữ liệu ngưỡng thuế"
        description={(error as Error).message}
      />
    )
  }

  if (isLoading || !data) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    )
  }

  return (
    <Card
      style={{
        borderLeft: `4px solid ${statusConfig.color}`,
      }}
    >
      <Row gutter={[24, 16]} align="middle">
        <Col xs={24} md={8}>
          <Statistic
            title={`Doanh thu thực tế ${year}`}
            value={data.total_actual}
            formatter={(v) => fmtVND(Number(v))}
            valueStyle={{ color: statusConfig.color, fontSize: 28 }}
          />
          <Text type="secondary" style={{ fontSize: 13 }}>
            {statusConfig.label}
          </Text>
        </Col>

        <Col xs={24} md={10}>
          <Text strong>
            {data.percent_of_threshold}% ngưỡng 1 tỷ
          </Text>
          <Progress
            percent={Math.min(data.percent_of_threshold, 100)}
            status={statusConfig.progressStatus}
            strokeColor={statusConfig.color}
          />
          <Text type="secondary" style={{ fontSize: 13 }}>
            Còn lại: {fmtVND(Math.max(data.remaining_to_threshold, 0))}
          </Text>
        </Col>

        <Col xs={24} md={6}>
          {data.is_current_year ? (
            <>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Dự báo cuối năm{' '}
                <Tooltip title="Ước tính = doanh thu thực tế + trung bình tháng đã qua × số tháng còn lại. Chỉ tham khảo, không phải số chính thức.">
                  <InfoCircleOutlined />
                </Tooltip>
              </Text>
              <div>
                <Text
                  strong
                  style={{
                    fontSize: 18,
                    color: data.forecast_exceeds_threshold ? '#ff4d4f' : undefined,
                  }}
                >
                  {fmtVND(data.forecast_total)}
                </Text>
              </div>
              {data.forecast_exceeds_threshold && (
                <Text type="danger" style={{ fontSize: 12 }}>
                  ⚠️ Dự báo có thể vượt ngưỡng năm nay
                </Text>
              )}
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: 13 }}>
              Năm đã qua — không dự báo
            </Text>
          )}
        </Col>
      </Row>

      {data.pms_future_booked > 0 && (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
          ℹ️ Ngoài ra có {fmtVND(data.pms_future_booked)} từ booking đã đặt nhưng chưa tới ngày trả
          phòng — chưa tính vào doanh thu thực tế/ngưỡng.
        </Text>
      )}

      {data.manual_total === 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="Chưa có khoản doanh thu nhập tay nào (cash/tour/OTA chưa sync) trong năm nay"
          description="Nếu có khoản thu ngoài PMS, vào trang Tài chính để bổ sung — tránh ghi thiếu sổ S1a."
        />
      )}
    </Card>
  )
}
```

---

## Bước 3 — Sửa file: `src/features/compliance/pages/S1aPage.tsx`

### 3a. Thêm import (sau dòng import `useS1aReport`):

Tìm dòng:
```tsx
import { useS1aReport, type S1aRow } from '../hooks/useS1aReport'
```

Thêm ngay sau:
```tsx
import { TaxThresholdBanner } from '../components/TaxThresholdBanner'
```

### 3b. Chèn component vào JSX

Tìm đoạn return JSX, ngay sau dòng:
```tsx
  return (
    <div className="page-grid">
```

Thêm `<TaxThresholdBanner year={selectedYear} />` ngay sau `<div className="page-grid">`, trước `<Flex justify="space-between"...>`. Kết quả:

```tsx
  return (
    <div className="page-grid">
      <TaxThresholdBanner year={selectedYear} />

      <Flex justify="space-between" align="center" gap={12} wrap>
```

---

## Kiểm tra sau khi xong
1. `npm run build` hoặc `npm run dev` — không có lỗi TypeScript.
2. Vào `/s1a` trên local — banner hiển thị phía trên bảng, đổi `selectedYear` (dropdown năm) phải re-fetch banner theo năm tương ứng.
3. Không sửa gì khác ngoài 3 file trên (1 file mới hook, 1 file mới component, 1 patch S1aPage.tsx).