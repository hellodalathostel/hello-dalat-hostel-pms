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
