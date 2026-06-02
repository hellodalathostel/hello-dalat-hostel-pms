function mapKnownRpcMessage(message: string): string {
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
