import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Form, Input, InputNumber, Modal, Select } from 'antd'
import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { paymentSchema } from '@/lib/schemas'
import type { PaymentFormValues } from '@/lib/schemas'
import { useRecordPayment } from '@/features/payment/hooks/usePayment'
import { usePaymentRequestId } from '@/features/payment/hooks/usePaymentRequestId'
import { PaymentError } from '@/features/payment/hooks/recordPaymentIdempotent'
import type { DashboardRoom } from '@/types/dashboard'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'

interface PaymentModalProps {
  visible: boolean
  room: DashboardRoom
  onCancel: () => void
}

const paymentMethodOptions: Array<{ label: string; value: PaymentFormValues['method'] }> = [
  { label: 'Tiền mặt', value: 'cash' },
  { label: 'Chuyển khoản', value: 'transfer' },
  { label: 'Quẹt thẻ', value: 'card' },
  { label: 'Khác', value: 'other' },
]

function getDefaultValues(room: DashboardRoom): PaymentFormValues {
  return {
    // #2 SỬA: dùng group_balance_due (group_grand_total - paid) thay vì balance_due
    // (balance_due là field legacy, trộn booking-level với group-level — sai khi group nhiều phòng).
    amount: Math.max(room.group_balance_due ?? 0, 0),
    method: 'transfer',
    note: '',
  }
}

// Modal thu tiền cho booking/group hiện tại, dữ liệu tổng tiền do DB quản lý.
export function PaymentModal({ visible, room, onCancel }: PaymentModalProps): JSX.Element {
  const { notification } = useAppFeedback()
  const recordPaymentMutation = useRecordPayment()
  const { get: getRequestId, rotate: rotateRequestId } = usePaymentRequestId()
  // Chặn double submit đồng bộ — isPending chỉ cập nhật sau lần render kế tiếp.
  const submittingRef = useRef(false)

  // Modal vẫn mounted giữa các lần mở (DashboardPage chỉ đổi visible) → mỗi lần mở là một
  // khoản mới, phải có id mới, nếu không lần thu thứ hai sẽ bị replay oan.
  useEffect(() => {
    if (visible) {
      rotateRequestId()
    }
  }, [visible, rotateRequestId])

  const {
    control,
    handleSubmit,
    reset,
    watch,
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: getDefaultValues(room),
    mode: 'onSubmit',
  })

  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() không tương thích React Compiler, known issue
  const selectedMethod = watch('method')

  const handleClose = () => {
    // Không cho đóng khi request đang bay: mở lại sẽ rotate id → bấm Ghi lần nữa có thể ghi trùng.
    if (submittingRef.current || recordPaymentMutation.isPending) {
      return
    }
    reset(getDefaultValues(room))
    onCancel()
  }

  const onSubmit = async (values: PaymentFormValues) => {
    if (submittingRef.current || recordPaymentMutation.isPending) {
      return
    }

    if (!room.group_id) {
      notification.error({
        message: 'Thiếu dữ liệu thanh toán',
        description: 'Không tìm thấy group_id để ghi nhận thanh toán.',
      })
      return
    }

    // RPC bắt buộc booking_id khi method = card (để tính surcharge vào bookings.surcharge)
    if (values.method === 'card' && !room.booking_id) {
      notification.error({
        message: 'Thiếu dữ liệu thanh toán',
        description: 'Quẹt thẻ cần booking_id để tính phụ phí 4%.',
      })
      return
    }

    submittingRef.current = true
    try {
      await recordPaymentMutation.mutateAsync({
        requestId: getRequestId(),
        groupId: room.group_id,
        // Chỉ truyền firstBookingId khi có — hook sẽ fallback về null
        firstBookingId: room.booking_id ?? undefined,
        amount: values.amount,
        method: values.method,
        note: values.note,
      })

      // Ghi xong (kể cả replayed) → id mới cho khoản kế tiếp
      rotateRequestId()
      reset(getDefaultValues(room))
      onCancel()
    } catch (error) {
      // Lỗi mutation đã được xử lý trong hook (onError toast).
      // Chỉ đổi id khi id đã gắn với khoản khác; lỗi khác giữ id để retry không ghi trùng.
      if (error instanceof PaymentError && error.kind === 'REQUEST_ID_REUSED') {
        rotateRequestId()
      }
    } finally {
      submittingRef.current = false
    }
  }

  return (
    <Modal
      open={visible}
      title="Thanh toán"
      onCancel={handleClose}
      maskClosable={!recordPaymentMutation.isPending}
      destroyOnClose
      footer={
        <>
          <Button onClick={handleClose} disabled={recordPaymentMutation.isPending}>Huỷ</Button>
          <Button
            type="primary"
            onClick={handleSubmit(onSubmit)}
            loading={recordPaymentMutation.isPending}
            disabled={recordPaymentMutation.isPending}
          >
            Xác nhận thu tiền
          </Button>
        </>
      }
    >
      <Form layout="vertical" onFinish={handleSubmit(onSubmit)}>
        <Controller
          control={control}
          name="amount"
          render={({ field, fieldState }) => (
            <Form.Item
              label="Số tiền"
              required
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <InputNumber
                value={field.value}
                min={0}
                onChange={(value) => field.onChange(value ?? 0)}
                style={{ width: '100%' }}
                formatter={(value) => {
                  if (value === undefined || value === null) {
                    return ''
                  }

                  const formatted = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                  return `${formatted} VND`
                }}
                parser={(value) => Number(String(value ?? '').replace(/[^\d.-]/g, ''))}
              />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name="method"
          render={({ field, fieldState }) => (
            <Form.Item
              label="Phương thức"
              required
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <Select {...field} options={paymentMethodOptions} />
            </Form.Item>
          )}
        />

        {selectedMethod === 'card' ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="Lưu ý: Hệ thống sẽ tự động cộng 4% phí quẹt thẻ vào tổng hóa đơn."
          />
        ) : null}

        <Controller
          control={control}
          name="note"
          render={({ field, fieldState }) => (
            <Form.Item
              label="Ghi chú"
              validateStatus={fieldState.error ? 'error' : ''}
              help={fieldState.error?.message}
            >
              <Input.TextArea {...field} rows={4} placeholder="Ghi chú giao dịch" maxLength={500} />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  )
}