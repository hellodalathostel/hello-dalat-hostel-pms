const formatVnd = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)

function mapKnownRpcMessage(message: string): string {
  // record_payment_txn (gọi trực tiếp hoặc lồng trong create_group_booking_txn khi ghi cọc).
  // Chỉ đọc message: create_group_booking_txn re-raise mọi lỗi với mã P0001 nên không dựa vào code.
  if (message.startsWith('OVERPAYMENT')) {
    const match = message.match(/số tiền (\d+) vượt quá số dư còn lại (-?\d+)/)
    if (match) {
      const remaining = Number(match[2])
      if (remaining <= 0) {
        return 'Booking đã thanh toán đủ, không thể ghi thêm tiền.'
      }
      return `Số tiền ${formatVnd(Number(match[1]))} vượt quá số dư còn lại ${formatVnd(remaining)}.`
    }
    return 'Số tiền vượt quá số dư còn lại của booking.'
  }

  if (message.includes('invalid input value for enum payment_method')) {
    return 'Phương thức thanh toán không hợp lệ.'
  }

  if (message.startsWith('BOOKING_NOT_FOUND')) {
    return 'Không tìm thấy booking.'
  }

  if (message.startsWith('BOOKING_DELETED')) {
    return 'Booking đã bị xoá.'
  }

  if (message.startsWith('BOOKING_NOT_EDITABLE: ')) {
    return message.replace('BOOKING_NOT_EDITABLE: ', '')
  }

  if (message.startsWith('ROOM_CONFLICT: ')) {
    return message.replace('ROOM_CONFLICT: ', '')
  }

  if (message.startsWith('INVALID_DATES')) {
    return 'Check-out phải sau check-in.'
  }

  if (message.startsWith('PERMISSION_DENIED')) {
    return 'Không có quyền thực hiện thao tác này.'
  }

  return message
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    error.message = mapKnownRpcMessage(error.message)
    return error
  }

  if (typeof error === 'string') {
    return new Error(mapKnownRpcMessage(error))
  }

  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  ) {
    return new Error(mapKnownRpcMessage((error as { message: string }).message))
  }

  return new Error('Đã có lỗi không xác định xảy ra')
}
