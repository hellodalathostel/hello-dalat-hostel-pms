import { useEffect, useState, type JSX } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Form, Modal } from 'antd'
import { processCheckOutTxn } from '@/api/checkInOutApi'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

interface CheckOutModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
}

/** Format tiền VND */
function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)
}

/** Parse số tiền nợ từ error message DB
 *  DB format: "HAS_DEBT: Khách cần thanh toán thêm 500000 VND..."
 *  DB trả integer thuần — không có dấu chấm/phẩy
 */
function parseDebtAmount(message: string): number | null {
  const match = message.match(/thêm\s+(\d+)\s*VND/i)
  if (!match) return null
  const parsed = parseInt(match[1], 10)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Modal xác nhận Check-out
 * Flow:
 *   1. Lần đầu click → gọi RPC với confirm_debt = false
 *   2. Nếu P0032/HAS_DEBT → hiện cảnh báo + checkbox xác nhận ghi nợ
 *   3. User tick checkbox → click lại → gọi RPC với confirm_debt = true
 */
export function CheckOutModal({ isOpen, onClose, bookingId }: CheckOutModalProps): JSX.Element {
  const queryClient = useQueryClient()
  const { notification } = useAppFeedback()

  // State cho flow nợ
  const [debtAmount, setDebtAmount] = useState<number | null>(null)
  const [isDebtConfirmed, setIsDebtConfirmed] = useState(false)

  // hasDebt = có lỗi nợ đang hiển thị
  const hasDebt = debtAmount !== null

  // Reset khi đóng modal
  useEffect(() => {
    if (!isOpen) {
      setDebtAmount(null)
      setIsDebtConfirmed(false)
    }
  }, [isOpen])

  const mutation = useMutation({
    mutationFn: processCheckOutTxn,
    onSuccess: async (result) => {
      notification.success({
        message: 'Trả phòng thành công',
        description: 'Phòng đã được cập nhật và sẵn sàng cho khách mới.',
      })
      onClose()
      // Invalidate các query liên quan
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard_today'] }),
        queryClient.invalidateQueries({ queryKey: ['room_calendar'] }),
        // Invalidate group detail nếu màn hình đó đang mở
        queryClient.invalidateQueries({ queryKey: ['group_detail', result.group_id] }),
      ])
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error)
      const isDebtError = msg.includes('P0032') || msg.includes('HAS_DEBT')

      if (!isDebtError) {
        notification.error({
          message: 'Lỗi trả phòng',
          description: msg || 'Đã xảy ra lỗi, vui lòng thử lại.',
        })
        return
      }

      // Parse số tiền nợ từ message DB (integer thuần)
      const amount = parseDebtAmount(msg)
      setDebtAmount(amount)
      setIsDebtConfirmed(false) // Reset checkbox khi có lỗi mới

      notification.warning({
        message: 'Đoàn khách còn nợ tiền',
        description:
          amount !== null
            ? `Số tiền cần thanh toán: ${formatVnd(amount)}`
            : 'Vui lòng xác nhận trước khi tiếp tục.',
      })
    },
  })

  const handleConfirm = () => {
    // Nếu có nợ nhưng chưa tick checkbox → block
    if (hasDebt && !isDebtConfirmed) {
      notification.warning({
        message: 'Chưa xác nhận ghi nợ',
        description: 'Vui lòng tick checkbox xác nhận ghi nợ trước khi tiếp tục.',
      })
      return
    }

    mutation.mutate({
      booking_id: bookingId,
      // Lần đầu: false. Lần 2 sau khi tick: true
      confirm_debt: hasDebt ? isDebtConfirmed : false,
    })
  }

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      title="Xác nhận trả phòng"
      destroyOnClose
      width={500}
      footer={
        <>
          <Button onClick={onClose} disabled={mutation.isPending}>
            Huỷ
          </Button>
          <Button
            type="primary"
            danger={hasDebt}
            onClick={handleConfirm}
            loading={mutation.isPending}
            // Chỉ disabled khi: có nợ VÀ chưa tick — không disabled lần đầu
            disabled={hasDebt && !isDebtConfirmed}
          >
            {hasDebt ? 'Xác nhận ghi nợ & trả phòng' : 'Xác nhận trả phòng'}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item label="Mã đặt phòng">
          {/* Hiện UUID ngắn cho dễ đọc */}
          <code style={{ fontSize: 13 }}>{bookingId}</code>
        </Form.Item>

        {/* Cảnh báo nợ tiền */}
        {hasDebt && (
          <>
            <Alert
              type="warning"
              showIcon
              message="Đoàn khách còn nợ tiền"
              description={`Số tiền cần thanh toán thêm: ${formatVnd(debtAmount!)}`}
              style={{ marginBottom: 16 }}
            />
            <Form.Item>
              <Checkbox
                checked={isDebtConfirmed}
                onChange={(e) => setIsDebtConfirmed(e.target.checked)}
                style={{
                  color: isDebtConfirmed ? undefined : '#ff4d4f',
                  fontWeight: 500,
                }}
              >
                Tôi xác nhận cho phép trả phòng với số nợ {formatVnd(debtAmount!)} — sẽ thu sau
              </Checkbox>
            </Form.Item>
          </>
        )}

        {/* Thông báo lần đầu (chưa có lỗi) */}
        {!hasDebt && (
          <Alert
            type="info"
            showIcon
            message="Xác nhận trả phòng?"
            description="Thao tác này sẽ chuyển trạng thái phòng sang 'Đã trả phòng' và không thể hoàn tác."
          />
        )}
      </Form>
    </Modal>
  )
}