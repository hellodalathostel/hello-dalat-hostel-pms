import { describe, expect, it } from 'vitest'
import { normalizeError } from './normalizeError'

const ROOM_OVERLAP_MESSAGE =
  'Phòng vừa có booking khác trùng ngày. Hãy tải lại lịch phòng và chọn phòng/ngày khác.'

describe('normalizeError — exclusion_violation trùng phòng', () => {
  it('PostgrestError code 23P01 → câu tiếng Việt', () => {
    const err = {
      code: '23P01',
      message:
        'conflicting key value violates exclusion constraint "no_overlapping_bookings_from_20260705"',
      details: null,
      hint: null,
    }
    expect(normalizeError(err).message).toBe(ROOM_OVERLAP_MESSAGE)
  })

  it('Error chỉ có message chứa no_overlapping_bookings → câu tiếng Việt', () => {
    const err = new Error('violates exclusion constraint "no_overlapping_bookings_from_20260705"')
    expect(normalizeError(err).message).toBe(ROOM_OVERLAP_MESSAGE)
  })

  it('ROOM_CONFLICT từ trigger vẫn giữ nhánh cũ', () => {
    expect(normalizeError({ code: 'P0001', message: 'ROOM_CONFLICT: Phòng 101 đang bị khoá' }).message).toBe(
      'Phòng 101 đang bị khoá',
    )
  })
})

describe('normalizeError — record_payment_idempotent_txn', () => {
  it('REQUEST_ID_REUSED (P0017) → câu tiếng Việt', () => {
    expect(normalizeError({ code: 'P0017', message: 'REQUEST_ID_REUSED: request_id đã dùng' }).message).toBe(
      'Mã giao dịch thanh toán đã dùng cho một khoản khác. Hãy đóng cửa sổ, mở lại rồi thử lại.',
    )
  })

  it('MISSING_REQUEST_ID (P0016) → câu tiếng Việt', () => {
    expect(normalizeError(new Error('MISSING_REQUEST_ID')).message).toBe(
      'Thiếu mã giao dịch thanh toán. Hãy tải lại trang rồi thử lại.',
    )
  })
})
