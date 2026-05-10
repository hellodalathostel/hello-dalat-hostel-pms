import { type JSX } from 'react'
import { Alert, Button, Form, Modal } from 'antd'
import { useCheckout } from '@/hooks/useCheckOut'

interface CheckOutModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
}

/**
 * Modal xác nhận Check-out
 * RPC warning sẽ được hiển thị bằng Modal.warning trong hook useCheckout.
 */
export function CheckOutModal({ isOpen, onClose, bookingId }: CheckOutModalProps): JSX.Element {
  const { mutate: checkout, isPending } = useCheckout()

  const handleConfirm = () => {
    checkout(bookingId, { onSuccess: () => onClose() })
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
          <Button onClick={onClose} disabled={isPending}>
            Huỷ
          </Button>
          <Button
            type="primary"
            onClick={handleConfirm}
            loading={isPending}
          >
            Xác nhận trả phòng
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item label="Mã đặt phòng">
          {/* Hiện UUID ngắn cho dễ đọc */}
          <code style={{ fontSize: 13 }}>{bookingId}</code>
        </Form.Item>

        <Alert
          type="info"
          showIcon
          message="Xác nhận trả phòng?"
          description="Thao tác này sẽ chuyển trạng thái phòng sang 'Đã trả phòng' và không thể hoàn tác."
        />
      </Form>
    </Modal>
  )
}