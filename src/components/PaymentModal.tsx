import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Space } from 'antd'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useRecordPayment } from '@/hooks/usePayment'
import { paymentSchema, type PaymentFormValues } from '@/lib/schemas'

export interface PaymentModalProps {
  groupId: string | null
  firstBookingId: string | null
  balanceDue: number
  onClose: () => void
  onSuccess: () => void
}

const METHOD_OPTIONS = [
  { label: 'Tien mat', value: 'cash' },
  { label: 'Chuyen khoan', value: 'transfer' },
  { label: 'The tin dung', value: 'card' },
  { label: 'Khac', value: 'other' },
]

const formatVND = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount) + ' d'

export function PaymentModal({
  groupId,
  firstBookingId,
  balanceDue,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const recordPaymentMutation = useRecordPayment()

  const { control, handleSubmit, reset } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: undefined,
      method: 'cash',
      note: '',
    },
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!groupId) {
      return
    }

    reset({
      amount: balanceDue > 0 ? balanceDue : undefined,
      method: 'cash',
      note: '',
    })
  }, [groupId, balanceDue, reset])

  const onSubmit = async (values: PaymentFormValues) => {
    if (!groupId || !firstBookingId) {
      return
    }

    await recordPaymentMutation.mutateAsync({
      groupId,
      firstBookingId,
      amount: values.amount,
      method: values.method,
      note: values.note,
    })

    onSuccess()
  }

  return (
    <Modal
      open={!!groupId && !!firstBookingId}
      title='Ghi nhan thanh toan'
      onCancel={onClose}
      destroyOnClose
      footer={() => (
        <>
          <Button onClick={onClose}>Dong</Button>
          <Button
            type='primary'
            htmlType='submit'
            loading={recordPaymentMutation.isPending}
            form='payment-form'
          >
            Ghi thanh toan
          </Button>
        </>
      )}
    >
      <Space direction='vertical' size={12} style={{ width: '100%' }}>
        {balanceDue <= 0 ? (
          <Alert
            type='warning'
            message='Group nay da thanh toan du. Ghi them se tao so du duong.'
            showIcon
          />
        ) : (
          <Alert type='info' message={`Con lai: ${formatVND(balanceDue)}`} showIcon />
        )}

        <Form id='payment-form' layout='vertical' onFinish={handleSubmit(onSubmit)}>
          <Controller
            control={control}
            name='amount'
            render={({ field, fieldState }) => (
              <Form.Item
                label='So tien'
                required
                validateStatus={fieldState.error ? 'error' : ''}
                help={fieldState.error?.message}
              >
                <InputNumber
                  value={field.value}
                  onChange={(value) => field.onChange(value ?? undefined)}
                  min={1}
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
            name='method'
            render={({ field, fieldState }) => (
              <Form.Item
                label='Phuong thuc'
                required
                validateStatus={fieldState.error ? 'error' : ''}
                help={fieldState.error?.message}
              >
                <Select {...field} options={METHOD_OPTIONS} />
              </Form.Item>
            )}
          />

          <Controller
            control={control}
            name='note'
            render={({ field, fieldState }) => (
              <Form.Item
                label='Ghi chu'
                validateStatus={fieldState.error ? 'error' : ''}
                help={fieldState.error?.message}
              >
                <Input.TextArea {...field} rows={2} placeholder='Ghi chu them (neu co)' />
              </Form.Item>
            )}
          />
        </Form>
      </Space>
    </Modal>
  )
}
