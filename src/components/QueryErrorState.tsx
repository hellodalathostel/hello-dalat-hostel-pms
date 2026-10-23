import type { ReactNode } from 'react'
import { Alert, Button, Result } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { normalizeError } from '@/shared/utils/normalizeError'

const DEFAULT_TITLE = 'Không tải được dữ liệu'
const DEFAULT_BANNER_DESCRIPTION = 'Không cập nhật được, đang hiện dữ liệu cũ.'

interface QueryErrorStateProps {
  title?: string
  // Lỗi từ query — chỉ hiển thị message đã chuẩn hoá, không lộ stack
  error?: unknown
  onRetry: () => void
  isRetrying?: boolean
  // block: thay nội dung danh sách; banner: dải cảnh báo mỏng phía trên dữ liệu cũ
  variant?: 'block' | 'banner'
  // Chỉ dùng cho banner: ghi đè mô tả mặc định; null = không có mô tả
  description?: ReactNode | null
  // Chỉ dùng cho block: thu gọn chiều cao khi nằm trong card nhỏ (vd lưới Dashboard)
  compact?: boolean
}

// Khối lỗi tải dữ liệu dùng chung (F04) — tách từ Sổ quỹ.
export function QueryErrorState({
  title = DEFAULT_TITLE,
  error,
  onRetry,
  isRetrying = false,
  variant = 'block',
  description,
  compact = false,
}: QueryErrorStateProps) {
  const retryButton = (
    <Button
      type={variant === 'block' ? 'primary' : 'default'}
      size={variant === 'banner' ? 'small' : 'middle'}
      icon={<ReloadOutlined />}
      onClick={onRetry}
      loading={isRetrying}
      disabled={isRetrying}
    >
      {isRetrying ? 'Đang thử lại...' : 'Thử lại'}
    </Button>
  )

  if (variant === 'banner') {
    return (
      <Alert
        role="alert"
        type="error"
        showIcon
        style={{ marginBottom: 16 }}
        message={title}
        description={description === undefined ? DEFAULT_BANNER_DESCRIPTION : description ?? undefined}
        action={retryButton}
      />
    )
  }

  // Chỉ lấy message, không in stack hay toàn bộ object lỗi
  const errorMessage = error === undefined || error === null ? undefined : normalizeError(error).message

  return (
    <div role="alert">
      <Result
        status="error"
        title={title}
        subTitle={errorMessage}
        extra={retryButton}
        style={compact ? { padding: '8px 0' } : undefined}
      />
    </div>
  )
}
